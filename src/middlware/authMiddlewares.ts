import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserModel } from '../routes/schemas/user'; // Asegúrate de importar correctamente
import { verifyToken, TokenPayload } from '../authentication/authUser';
import { RoleModel } from '../routes/schemas/role';
import App from '../app'; // Importa la instancia de App si es necesario para acceder al cliente de Mongoose
import mongoose from 'mongoose';


// Extender la interfaz Request para incluir userId
interface AuthRequest extends Request {
	userId?: string;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
	try {
		const authHeader = req.headers.authorization;

		if (!authHeader) {
			return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'No se proporcionó un token de autorización' });
		}

		const token = authHeader.split(' ')[1];
		const payload = verifyToken(token) as TokenPayload;
		const userId = payload.userId;
		req.userId = userId; // Guardar el userId en la solicitud para usarlo posteriormente

		// Utilizar mongoose directamente
		const user = await UserModel(mongoose).findById(userId).populate('roles').exec();

		if (!user) {
			return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Usuario no encontrado' });
		}

    if (user.status === 'deactivated') {
      return res.status(StatusCodes.FORBIDDEN).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });
    }

    if (user.status === 'blacklisted') {
      return res.status(StatusCodes.FORBIDDEN).json({ error: 'Has sido bloqueado del sistema.' });
    }

		// Continuar con el siguiente middleware si el usuario está autenticado
		next();
	} catch (error) {
		console.error('Error en el middleware de autenticación:', error);
		return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Token de autorización inválido' });
	}
}


export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
	try {
		const userId = req.userId;
		if (!userId) {
			return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
		}

		// Utilizar mongoose directamente
		const user = await UserModel(mongoose).findById(userId).populate('roles').exec();

		if (!user) {
			return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no encontrado' });
		}

		// Verificar si el usuario tiene el rol de administrador
		const isAdmin = user.roles.some(role => role.name === 'admi');

		if (!isAdmin) {
			return res.status(StatusCodes.FORBIDDEN).json({ message: 'Acceso denegado. Se requiere rol de administrador.' });
		}

		// El usuario es administrador, continuar con la solicitud
		next();
	} catch (error) {
		console.error('Error en adminMiddleware:', error);
		return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error en la verificación de permisos' });
	}
};
