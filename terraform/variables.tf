/* ------------------------
 * Project variables
 * ------------------------ */
variable "project" {
  type = string
  description = "The gcp project name"
}

variable "project_id" {
  type = string
  description = "The gcp project id"
}

variable "region" {
  type = string
  description = "The gcp region"
}
variable "zone" {
  type = string
  description = "The gcp zone"
}

/* ------------------------
 * General variables
 * ------------------------ */
variable "env" {
  type = string
  description = "The environment name"
}

/* ------------------------
 * App variables
 * ------------------------ */
variable "app_name" {
  type = string
  description = "The name of the app e.g. gasolina-api. This will be used for all roles and service accounts. Only letters numbers and hyphens '-'."
}

variable "num_signers" {
  type = string
  description = "The number of signers in the GCP project."
  default = 3
}

variable "available_chain_names" {
  type = string
  description = "Comma separated list of chain names that gasolina will support e.g. ethereum,bsc,avalanche,polygon"
}