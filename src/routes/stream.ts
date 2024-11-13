import { Model } from 'mongoose';
import { authMiddleware } from '../middlware/authMiddlewares';
import { Request, Response } from 'express';
import App from '../app';
import { StatusCodes } from 'http-status-codes';
import { StreamModel, IStream } from './schemas/stream';
import { v4 as uuidv4 } from 'uuid'; // Importa uuid
import SocketController from './socket';

interface AuthRequest extends Request {
	userId?: string;
}

export class StreamController {
	private route: string;
	private app: App;
	private streamModel: Model<IStream>;
	private socketController: SocketController;

	constructor(app: App, route: string, socketController: SocketController) {
		this.route = route;
		this.app = app;
		this.streamModel = StreamModel;
		this.socketController = socketController;
		this.initRoutes();
	}

	private initRoutes(): void {
		this.app.getAppServer().get(`${this.route}/streams`, authMiddleware, this.getStreams.bind(this));
		this.app.getAppServer().post(`${this.route}/streams`, authMiddleware, this.createStream.bind(this));
		this.app.getAppServer().delete(`${this.route}/streams/:streamId`, authMiddleware, this.deleteStream.bind(this));

		// En StreamController constructor o método initRoutes
		this.app.getAppServer().post(`${this.route}/streams/:streamId/shareScreen`, authMiddleware, this.startScreenShare.bind(this));
		this.app.getAppServer().delete(`${this.route}/streams/:streamId/shareScreen`, authMiddleware, this.stopScreenShare.bind(this));


	}

	private async getStreams(req: Request, res: Response): Promise<Response> {
		try {
			const streams = await this.streamModel.find({active: true}); // Obtener los streams
			return res.status(StatusCodes.OK).json({ streams });
		} catch (error) {
			console.error('Error obteniendo streams:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener los streams' });
		}
	}
	private async createStream(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { title } = req.body;
			const userId = req.userId;
			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			// Genera un streamKey único
			const streamKey = uuidv4();

			const newStream = new this.streamModel({ title, userId, streamKey });
			await newStream.save();
			return res.status(StatusCodes.CREATED).json({ stream: newStream });
		} catch (error) {
			console.error('Error creando stream:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al crear el stream' });
		}
	}
	private async deleteStream(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { streamId } = req.params;
			const userId = req.userId;
			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}
			// Verificar que el usuario es el propietario del stream
			const stream = await this.streamModel.findOneAndUpdate(
				{ _id: streamId, userId },
				{ active: false },
				{ new: true }
			);
			if (!stream) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Stream no encontrado o no tienes permisos para eliminarlo' });
			}
			return res.status(StatusCodes.OK).json({ message: 'Stream detenido', stream });
		} catch (error) {
			console.error('Error deteniendo el stream:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al detener el stream' });
		}
	}

	// stream.ts (continuación)

	private async startScreenShare(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { streamId } = req.params;
			const userId = req.userId;
			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			// Verificar que el usuario es el propietario del stream
			const stream = await this.streamModel.findOne({ _id: streamId, userId });
			if (!stream) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Stream no encontrado o no tienes permisos para compartir pantalla' });
			}

			// Actualizar el estado de isScreenSharing
			stream.isScreenSharing = true;
			await stream.save();

			// Emitir un evento a través del SocketController
			this.socketController.emitToRoom(streamId, 'start-screen-share', { streamId });

			return res.status(StatusCodes.OK).json({ message: 'Compartición de pantalla iniciada' });
		} catch (error) {
			console.error('Error iniciando la compartición de pantalla:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al iniciar la compartición de pantalla' });
		}
	}

	private async stopScreenShare(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { streamId } = req.params;
			const userId = req.userId;
			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			// Verificar que el usuario es el propietario del stream
			const stream = await this.streamModel.findOne({ _id: streamId, userId });
			if (!stream) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Stream no encontrado o no tienes permisos para detener la compartición de pantalla' });
			}

			// Actualizar el estado de isScreenSharing
			stream.isScreenSharing = false;
			await stream.save();

			// Emitir un evento a través del SocketController
			this.socketController.emitToRoom(streamId, 'stop-screen-share', { streamId });

			return res.status(StatusCodes.OK).json({ message: 'Compartición de pantalla detenida' });
		} catch (error) {
			console.error('Error deteniendo la compartición de pantalla:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al detener la compartición de pantalla' });
		}
	}

	// Resto de los métodos existentes...


}

export default StreamController;

