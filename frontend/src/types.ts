export interface Product {
  id: string;
  name: string;
  description: string;
  price: string;       
  stock: number;
  initialStock: number;
  imageUrl: string;
  updatedAt: string;
}

export interface Reservation {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

export interface ReservationWithProduct extends Reservation {
  product: Product;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
