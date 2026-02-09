export async function createBindingSession(
    apiKey: string,
    addresses: string[],
    sphincsVariant: number  // Add SPHINCS+ variant parameter
) {
    const response = await
        fetch('http://localhost:8080/api-keys/binding/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`  // Send API key in header
            },
            body: JSON.stringify({
                addresses_to_bind: addresses,
                wallet_info: {
                    type: 'QuantumPurse',
                    version: '0.3.3',
                    platform: 'wasm/web',  // Platform is WASM running in web browser
                    sphincs_variant: sphincsVariant  // Include SPHINCS+ variant for signature verification
                }
            })
        });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Server error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    // Returns: { account_info, challenges, expires_at }
    return data;
}

/**
 * Complete the address binding process by:
 * 1. Signing each challenge with the corresponding address's private key
 * 2. Submitting the signatures for verification
 */
export async function completeBinding(
    apiKey: string,
    challenges: any[],      // Use already-fetched challenges
    lockArgsList: string[],
    quantumPurse: any      // QuantumPurse instance
) {
    try {
        // Step 1: Sign each challenge with the corresponding address's private key
        console.log('Signing challenges for addresses...');
        const signedChallenges = [];

        for (let i = 0; i < challenges.length; i++) {
            const challenge = challenges[i];
            const lockArgs = lockArgsList[i];

            console.log(`Signing challenge for address ${challenge.address}`);

            // Sign the challenge text with the SPHINCS+ private key
            // This will trigger the password modal for user authentication
            const signature = await quantumPurse.signXXXMessage(
                challenge.challenge,  // The challenge text to sign
                lockArgs              // Which address's key to use
            );

            signedChallenges.push({
                address: challenge.address,
                signature: signature
            });
        }

        // Step 2: Submit signed challenges for verification
        console.log('Submitting signed challenges for verification');
        const verifyResponse = await fetch('http://localhost:8080/api-keys/binding/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                signed_challenges: signedChallenges
            })
        });

        if (!verifyResponse.ok) {
            const error = await verifyResponse.text();
            throw new Error(`Verification failed: ${verifyResponse.status} - ${error}`);
        }

        const result = await verifyResponse.json();
        console.log('Address binding completed successfully:', result);

        return {
            success: true,
            ...result
        };

    } catch (error) {
        console.error('Address binding failed:', error);
        throw error;
    }
}