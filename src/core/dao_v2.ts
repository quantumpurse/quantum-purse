import QuantumPurse from "./quantum_purse";

export async function createBindingSession(
    apiKey: string,
    addresses: string[]
) {
    const response = await
        fetch('http://localhost:8080/governance/address-binding/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`  // Send API key in header
            },
            body: JSON.stringify({
                addresses_to_bind: addresses
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
    challenges: any[],
    lockArgsList: string[],
    quantumPurse: QuantumPurse
) {
    try {
        // Step 1: Sign all challenges in batch with a single password request
        console.log('Signing challenges for all addresses in batch...');

        // Prepare messages and keys for batch signing
        const messagesToSign = challenges.map((challenge, i) => ({
            message: challenge.challenge,
            lockArgs: lockArgsList[i]
        }));

        // Sign all messages with one password request
        const signatures = await quantumPurse.signXXXMessagesBatch(messagesToSign);

        // Build signed challenges array
        const signedChallenges = signatures.map((signature, i) => ({
            address: challenges[i].address,
            signature: signature
        }));

        // Step 2: Submit signed challenges for verification
        console.log('Submitting signed challenges for verification');
        const verifyResponse = await fetch('http://localhost:8080/governance/address-binding/verify', {
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