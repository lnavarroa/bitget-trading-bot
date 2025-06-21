const axios = require('axios');

const API_URL = 'https://api.bitget.com/api/spot/v1/public/products';

async function fetchProducts() {
    try {
        const response = await axios.get(API_URL);
        const products = response.data.data || [];
        
        // Inspeccionar la estructura de los datos
        console.log('Estructura de los datos:', products[0]);

        // Extraer correctamente los identificadores
        const instrumentos = products.map(product => product.instId || product.symbol || product.name);
        console.log('Instrumentos disponibles:', instrumentos);
    } catch (error) {
        console.error('❌ Error al obtener instrumentos:', error);
    }
}

fetchProducts();