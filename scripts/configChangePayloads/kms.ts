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

/**
 * Utility to parse GCP KMS Keys from a file.
 * @param {string} input
 */
export const parseKmsKeyIds = (input: string): GcpKmsKey[] => {
    return JSON.parse(input) as GcpKmsKey[]
}
