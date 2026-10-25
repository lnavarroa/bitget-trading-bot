const axios = require('axios');

const API_URL = 'https://api.bitget.com/api/spot/v1/public/products';

async function fetchProducts() {
  try {
    const response = await axios.get(API_URL);
    const products = response.data.data || [];
    console.log('Instrumentos disponibles:', products.map((product) => product.instId));
  } catch (error) {
    console.error('❌ Error al obtener instrumentos:', error);
  }
}

fetchProducts();