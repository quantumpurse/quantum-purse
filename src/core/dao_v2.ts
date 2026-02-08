export async function createBindingSession(apiKey: string,
    addresses: string[]) {
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
                    version: '1.0.0',
                    platform: 'wasm/web'  // Platform is WASM running in web browser
                }
            })
        });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Server error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    // Returns: { session_token, challenge, expires_at }
    return data;
}