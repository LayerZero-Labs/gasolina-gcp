/**
 * Defines a GCP KMS Key.
 */
export interface GcpKmsKey {
    projectId: string
    locationId: string
    keyRingId: string
    keyId: string
    keyVersion: string
}
