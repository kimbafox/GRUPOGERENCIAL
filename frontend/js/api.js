const API = {
    baseUrl: '',

    async request(url, options = {}) {
        const response = await fetch(`${this.baseUrl}${url}`, options);
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
            ? await response.json()
            : { ok: response.ok, mensaje: response.statusText };

        if (typeof payload.ok === 'undefined') {
            payload.ok = response.ok;
        }

        if (!response.ok && !payload.mensaje) {
            payload.mensaje = 'La solicitud no pudo completarse.';
        }

        return payload;
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

    async obtenerUsuarios(adminEmail) {
        return this.request(`/api/usuarios?adminEmail=${encodeURIComponent(adminEmail || '')}`);
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

    async obtenerProductosGestion(email) {
        return this.request(`/api/productos/gestion?email=${encodeURIComponent(email || '')}`);
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

    async eliminarProducto(id, actorEmail) {
        return this.request(`/api/productos/${id}?email=${encodeURIComponent(actorEmail || '')}`, {
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

    async obtenerDashboard(email) {
        const suffix = email ? `?email=${encodeURIComponent(email)}` : '';
        return this.request(`/api/dashboard/stats${suffix}`);
    }
};
