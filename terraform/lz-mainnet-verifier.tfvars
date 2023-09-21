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
gasolina_ver = "1.0.0"                        // Edit: Gasolina version to deploy
// Edit: the chain names that gasolina will support and there are RPC providers for
available_chain_names = "ethereum,bsc,avalanche,polygon,arbitrum,optimism,fantom"