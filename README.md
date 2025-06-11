# gasolina-gcp

## Description

This repository provides Infrastructure-As-Code (IAC) for installing Gasolina on GCP via Terraform.

## Step-by-step instructions on setting up the infrastructure and deploying the Gasolina application

### 1. Set up the project, install gcloud and terraform

-   Go to: https://console.cloud.google.com and set up a project
-   Go to: https://console.cloud.google.com/billing and create a GCP billing account
-   Attach your billing account to your project
-   Install gcloud cli: https://cloud.google.com/sdk/docs/install
-   Install terraform cli: https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli

### 2. Authenticate gcloud cli with your GCP account

```shell
gcloud config set project <gcp_project_name>
```

### 3. Create GCS bucket to store Terraform backend

Create a GCS bucket to store the Terraform backend state. The `gcp_bucket_name` is unique across all GCP projects.
A good naming convention would be `<project>-<environment>-gasolina-tfstate`.

```shell
gcloud storage buckets create gs://<gcp_bucket_name> --project=<gcp_project_name> --location=<location e.g. US-EAST1>
```

### 4. Modify the backend config and tfvars files

Configure your backend config with bucket and environment in `terraform/lz-<environment>-verifier.backend.conf`.

In `terraform/lz-<environment>-verifier.backend.conf`:

```conf
# Use the <gcp_bucket_name> you created in the previous step
bucket = "foobar-lz-mainnet-verifier_gasolina-terraform-state"
# Prefix will be your environment
prefix = "mainnet"
```

In `terraform/lz-<environment>-verifier.tfvars`:
Edit all the values that has an Edit comment to it

```tfvars
/* ------------------------
 * Project variables
 * ------------------------ */
project    = "<gcp_project_name>"             // Edit: Your project name e.g. foobar-lz-mainnet-verifier
project_id = "<gcp_project_id>"               // Edit: Your project id number e.g. 111111111
region     = "<gcp_region>"                   // Edit: Your project region e.g. us-east1
zone       = "<gcp_zone>"                     // Edit: Your project zone e.g. us-east1-c

/* ------------------------
 * General variables
 * ------------------------ */
env = "mainnet"                               // Edit: Environment e.g. mainnet, testnet, etc.

/* ------------------------
 * KMS-HSM variables
 * ------------------------ */
// Used for number of signers to create in KMS-HSM.
// Typical setup is 1 signer per Gasolina-api per GCP project
num_signers = 1

/* ------------------------
 * App variables
 * ------------------------ */
app_name = "gasolina-api"
// Edit: the chain names that gasolina will support and there are RPC providers for
available_chain_names = "ethereum,bsc,avalanche,polygon,arbitrum,optimism,fantom"
```

### 5. Add your RPC providers to providers-<env>.json

There are public RPCs that are meant for testing/examples in providers-mainnet.json. These are not recommended
to be used in production. You can add your own providers to the file. The URIs are ordered by priority where the first
is prioritized before the next uri to be used for fallback.

### 6. Run Terraform to create the infrastructure and deploy gasolina

```shell
# change directory to terraform/
cd terraform

# make sure your gcloud is set for the correct project (if already done in previous step, skip this)
gcloud config set project <gcp_project_name>
gcloud auth application-default login

# init backend
terraform init -backend-config=<backend_file>.backend.conf -reconfigure

# review the plan before applying
terraform plan --var-file=<tfvars_file>.tfvars

# If plan is correct, apply the plan
terraform apply --var-file=<tfvars_file>.tfvars
```

If everything is successful, you should have a running gasolina-api deployed to Google Cloud Run.

### 8. Test the gasolina-api

1. Send a GET request to your gasolina-api cloud run URL: https://<gcp_cloud_run_host>.a.run.app and it should return `HEALTHY`
2. Send a GET request to the signer-info endpoint, and it will return to you the list of signers created in KMS-HSM `https://<<gcp_cloud_run_host>.a.run.app/signer-info?chainName=<chainName>`
3. To test the API against a sample message, in the root directory run:

```bash
ts-node scripts/testDeployment.ts -u <URL> -e <environment>
```

-   A successful response will look like:

```bash
--- [200] Successful request ---
Response: {
  signatures: [
    {
      signature: '<signature>',
      address: '<address>'
    },
    {
      signature: '<signature>',
      address: '<address>'
    }
  ]
}

```

## Getting signatures to change DVN onchain configs

### Setup

Depending on the environment (i.e testnet/mainnet), fill in the appropriate information regarding DVN addresses and KMS key ids in the `scripts/configChangePayloads/data` folder. The file names should be `dvn-addresses-<environment>.json` and `kms-keyids-<environment>.json` respectively. Take a look at existing testnet examples in the `scripts/configChangePayloads/data` folder to see how they need to be filled.

### Signatures for changing quorum

```
ts-node scripts/configChangePayloads/createSetQuorumSignatures.ts -e <environment> -c <comma-separated-chain-names> --oldQuorum <number> --newQuorum <number>
# e.g. ts-node scripts/configChangePayloads/createSetQuorumSignatures.ts -e testnet -c bsc,avalanche,fantom --oldQuorum 2 --newQuorum 1
```

### Signatures for adding/removing a signer

When adding a signer, you need to set `--shouldRevoke` arg as 0, when removing, you need to set it as 1.

```
ts-node scripts/configChangePayloads/createSetQuorumSignatures.ts -e <environment> -c <comma-separated-chain-names> --q <quorum> --signerAddress <string> --shouldRevoke <0 or 1>
# e.g. ts-node scripts/configChangePayloads/createAddOrRemoveSignerSignatures.ts -e testnet -c bsc,avalanche,fantom -q 1 --signerAddress 0x85e4857b7f15bbbbbc72d933a6357d3c22a0bbc7 --shouldRevoke 1
```

## Troubleshooting

### 1. Error creating KeyRing

Note, you may run into a known GCP/Terraform issue where the backing services have been enabled in a fresh account, but
are not yet available for use. This will manifest in something similar to the following:

```text
│ Error: Error creating KeyRing: googleapi: Error 403: Google Cloud KMS API has not been used in project <gcp_project_id> before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/cloudkms.googleapis.com/overview?project=<gcp_project_id> then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.
```

If this happens, simply wait a few minutes and re-run the command.
