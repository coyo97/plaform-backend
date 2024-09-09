import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserModel } from '../routes/schemas/user'; // Asegúrate de importar correctamente
import { verifyToken, TokenPayload } from '../authentication/authUser';
import { RoleModel } from '../routes/schemas/role';
import App from '../app'; // Importa la instancia de App si es necesario para acceder al cliente de Mongoose

// Extender la interfaz Request para incluir userId
interface AuthRequest extends Request {
  userId?: string;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'No se proporcionó un token de autorización' });
    }

    const payload = verifyToken(token) as TokenPayload;
    const userId = payload.userId;
    req.userId = userId; // Guardar el userId en la solicitud para usarlo posteriormente

    // Instancia correcta del modelo de usuario
    const app = new App(); // Crea una instancia de App o usa la instancia existente
    const user = await UserModel(app.getClientMongoose()).findById(userId).populate('roles').exec();

    if (!user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Usuario no encontrado' });
    }

    // Continuar con el siguiente middleware si el usuario está autenticado
    next();
  } catch (error) {
    console.error('Error en el middleware de autenticación:', error);
    return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Token de autorización inválido' });
  }
}

