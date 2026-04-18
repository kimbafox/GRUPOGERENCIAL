const API = {
    baseUrl: '',
    async login(email, password) {
        const response = await fetch(`${this.baseUrl}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        return response.json();
    },
    async health() {
        const response = await fetch(`${this.baseUrl}/api/health`);
        return response.json();
    }
};
