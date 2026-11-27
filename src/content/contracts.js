// Método y ruta leídos de la API. Una operación nueva puede documentarse
// sin entrar acá: el portal la muestra igual. Estas claves no se pueden
// borrar ni cambiar de ruta desde el panel, porque este archivo no es la API.
export const VERIFIED_ROUTES = {
  login: ['POST', '/api/auth/login/'],
  'express-orders': ['POST', '/api/wms/expressOrders'],
  orders: ['POST', '/api/wms/orders'],
  'cancel-order': ['POST', '/api/wms/cancelOrder'],
  'get-orders': ['POST', '/api/wms/GetOrders'],
  'track-orders': ['POST', '/api/wms/track_orders'],
  'tracking-legacy': ['POST', '/api/wms/tracking'],
  'shipping-cost': ['POST', '/api/wms/GetShippingCost'],
  'delivery-date': ['POST', '/api/wms/getDeliveryDate'],
  'get-stock': ['POST', '/api/wms/GetStock'],
  'get-label': ['POST', '/api/wms/Getlabel'],
  documents: ['POST', '/api/wms/Documents'],
  'consignment-details': ['POST', '/api/wms/ConsignmentDetails'],
  'get-ingresos': ['POST', '/api/wms/getIngresos']
};
