provider "google" {
  project         = var.project
  region          = var.region
  zone            = var.zone
}

terraform {
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "4.76.0"
    }
  }
}

data "google_project" "project" {}

module "enabled_google_apis" {
  source                      = "terraform-google-modules/project-factory/google//modules/project_services"
  version                     = "14.3"
  project_id                  = var.project_id
  activate_apis               = [
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "iamcredentials.googleapis.com",
    "iam.googleapis.com",
    "cloudbuild.googleapis.com",
    "logging.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudkms.googleapis.com",
    "storage.googleapis.com"
  ]
  disable_services_on_destroy = false
  disable_dependent_services = true
}

// create additional service accounts
resource "google_service_account" "app-service-account" {
  account_id = var.app_name
  display_name = var.app_name

  depends_on = [module.enabled_google_apis.project_id]
}

// Service account for Gasolina API
resource "google_project_iam_custom_role" "app-role" {
  role_id     = "${replace(var.app_name, "-", "_")}_role"
  title       = "${var.app_name} Role"
  description = "Restrictive access to secret for service account"
  permissions = ["secretmanager.versions.access"]

  depends_on = [module.enabled_google_apis.project_id]
}

resource "google_project_iam_member" "app-role-binding" {
  project = var.project
  role    = "projects/${var.project}/roles/${google_project_iam_custom_role.app-role.role_id}"
  member  = "serviceAccount:${google_service_account.app-service-account.email}"

  depends_on = [module.enabled_google_apis.project_id]
}

// HSM-KMS setup for signers
resource "google_kms_key_ring" "gasolina_key_ring" {
  name       = "gasolinaKeyRing"
  location   = "global"

  depends_on = [module.enabled_google_apis.project_id]
}

resource "google_kms_crypto_key" "gasolina_signers" {
  count            = var.num_signers

  name             = "gasolinaKey${count.index + 1}"
  key_ring         = google_kms_key_ring.gasolina_key_ring.id
  purpose          = "ASYMMETRIC_SIGN"

  version_template {
    protection_level = "HSM"
    algorithm        = "EC_SIGN_SECP256K1_SHA256"
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [module.enabled_google_apis.project_id]
}

resource "google_kms_crypto_key_iam_binding" "crypto_key" {
  count         = var.num_signers

  crypto_key_id = google_kms_crypto_key.gasolina_signers[count.index].id
  role          = "roles/cloudkms.signerVerifier"
  members       = [google_project_iam_member.app-role-binding.member]

  depends_on = [module.enabled_google_apis.project_id]
}

// GCS setup for provider configs
resource "google_storage_bucket" "providerconfigs_bucket" {
  name     = "providerconfigs-${var.project}"
  location = var.region
  force_destroy = false

  depends_on = [module.enabled_google_apis.project_id]
}

resource "google_storage_bucket_object" "providerconfigs_object" {
  name         = "providers.json"
  bucket       = google_storage_bucket.providerconfigs_bucket.name
  source       = "providers-${var.env}.json"
  content_type = "text/json"

  depends_on = [module.enabled_google_apis.project_id]
}

resource "google_storage_bucket_iam_binding" "providerconfigs_object_binding" {
  bucket  = google_storage_bucket.providerconfigs_bucket.name
  role    = "roles/storage.objectViewer"
  members = [google_project_iam_member.app-role-binding.member]

  depends_on = [module.enabled_google_apis.project_id]
}

// Gasolina Cloud Run deployment
resource "google_cloud_run_service" "gasolina_api" {
  name     = "gasolina-api"
  location = var.region

  metadata {
    annotations = {
      "run.googleapis.com/invoker-iam-disabled" = "true"
    }
  }

  template {
    spec {
      service_account_name = "gasolina-api@${var.project}.iam.gserviceaccount.com"

      containers {
        image = "${var.app_image_uri}:${var.app_version}"

        resources {
          limits = {
            cpu    = 4
            memory = "8Gi"
          }
        }

        liveness_probe {
          http_get {
            path = "/"
            port = 8999
          }
        }

        ports {
          container_port = 8999
        }

        env {
          name = "SIGNER_TYPE"
          value = "KMS"
        }
        env {
          name  = "KMS_CLOUD_TYPE"
          value = "GCP"
        }
        env {
          name  = "LAYERZERO_KMS_IDS"
          value = "gasolinaKey1"
        }
        env {
          name  = "LAYERZERO_ENVIRONMENT"
          value = var.env
        }
        env {
          name  = "GCP_PROJECT_ID"
          value = var.project
        }
        env {
          name  = "GCP_KEY_RING_ID"
          value = "gasolinaKeyRing"
        }
        env {
          name  = "LAYERZERO_SUPPORTED_ULN_VERSIONS"
          value = "[\"V2\"]"
        }
        env {
          name  = "LAYERZERO_AVAILABLE_CHAIN_NAMES"
          value = var.available_chain_names
        }
        env {
          name  = "CONFIG_BUCKET_NAME"
          value = "providerconfigs-${var.project}"
        }
        env {
          name = "PROVIDER_CONFIG_TYPE"
          value = "GCS"
        }
        env {
          name = "LAYERZERO_VERIFY_AND_DELIVER_WHITELIST"
          value = "{}"
        }
        env {
          name  = "SERVER_PORT"
          value = "8999"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      metadata[0].annotations["run.googleapis.com/urls"]
    ]
  }

  depends_on = [
    module.enabled_google_apis.project_id,
    google_project_iam_custom_role.app-role
  ]
}
