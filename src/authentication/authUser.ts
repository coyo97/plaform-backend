import jwt from 'jsonwebtoken';


export interface TokenPayload {
  userId: string;  
}

export function generateToken(userId: string): string {
  const token = jwt.sign({ userId }, 'secret_key', { expiresIn: '2h' });
  return token;
}

export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, process.env.JWT_SECRET || 'your_secret') as TokenPayload;
  return payload;
}
