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
    },
    async obtenerUsuarios() {
        const response = await fetch(`${this.baseUrl}/api/usuarios`);
        return response.json();
    },
    async guardarUsuario(usuario) {
        const response = await fetch(`${this.baseUrl}/api/usuarios`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(usuario)
        });

        return response.json();
    }
};
