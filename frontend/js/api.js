const API = {
    baseUrl: '',

    async request(url, options = {}) {
        const token = sessionStorage.getItem('authToken');
        const headers = {
            ...(options.headers || {})
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${this.baseUrl}${url}`, {
            ...options,
            headers
        });

        return response.json();
    },

    async login(email, password) {
        return this.request('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
    },

    async health() {
        return this.request('/api/health');
    },

    async obtenerSesion() {
        return this.request('/api/session');
    },

    async logout() {
        return this.request('/api/logout', {
            method: 'POST'
        });
    },

    async obtenerUsuarios() {
        return this.request('/api/usuarios');
    },

    async guardarUsuario(usuario) {
        return this.request('/api/usuarios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(usuario)
        });
    },

    async obtenerProductos() {
        return this.request('/api/productos');
    },

    async obtenerMisProductos() {
        return this.request('/api/mis-productos');
    },

    async guardarProducto(producto) {
        const method = producto.id ? 'PUT' : 'POST';
        const url = producto.id ? `/api/productos/${producto.id}` : '/api/productos';

        return this.request(url, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(producto)
        });
    },

    async eliminarProducto(id) {
        return this.request(`/api/productos/${id}`, {
            method: 'DELETE'
        });
    },

    async comprarProducto(compra) {
        return this.request('/api/compras', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(compra)
        });
    },

    async obtenerDashboard() {
        return this.request('/api/dashboard/stats');
    },

    async obtenerMiDashboard() {
        return this.request('/api/dashboard/mis-stats');
    }
};
