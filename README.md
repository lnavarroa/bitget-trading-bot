# Bitget Trading Bot

Bot de trading automatizado para Bitget utilizando Node.js y React.

## 🔧 Tecnologías
- Backend: Node.js con Bitget SDK oficial
- Frontend: React + Vite
- API de Bitget: [v3-bitget-api-sdk](https://github.com/BitgetLimited/v3-bitget-api-sdk)

## 🚀 Funcionalidades (en desarrollo)
- Seguimiento de precio en tiempo real
- Trading automático con lógica de ganancias de porcentaje ajustable (por defecto 0.07%, considendo 0.1% por cada transacción de compra y venta, la ganacia es de 0.5%)
- Gestión de órdenes de compra/venta
- Dashboard visual del estado de operaciones

## 🛠️ Instalación

### Backend

```bash
cd backend
npm install
npm run dev
