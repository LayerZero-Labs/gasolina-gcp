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
app_image_uri = "public.ecr.aws/t7p6p5n2/gasolina"
app_version = "latest"                        // Edit: Gasolina version to deploy
available_chain_names = "ethereum,bsc,avalanche,polygon,arbitrum,optimism,fantom" // Edit: the chain names that gasolina will support and there are RPC providers for
