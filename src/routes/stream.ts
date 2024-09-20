import { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from '../authentication/authUser';
import { StreamModel, IStream } from './schemas/stream';
import { Model } from 'mongoose';
import { authMiddleware } from '../middlware/authMiddlewares';
import { Request, Response } from 'express';
import App from '../app';
import { StatusCodes } from 'http-status-codes';

export class StreamController {
    private io: SocketIOServer;
    private route: string;
    private app: App;
    private streamModel: Model<IStream>;

    constructor(io: SocketIOServer, app: App, route: string) {
        this.io = io;
        this.route = route;
        this.app = app;
        this.streamModel = StreamModel;
        this.initRoutes();
        this.initializeSocketEvents();
    }

    private initializeSocketEvents(): void {
        // Middleware de autenticación de Socket.IO
        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error'));
            }
            try {
                const payload = verifyToken(token);
                socket.data.userId = payload.userId; // Almacenar userId en el socket
                next();
            } catch (error) {
                next(new Error('Invalid token'));
            }
        });

        // Manejo de eventos de conexión
        this.io.on('connection', (socket) => {
            const userId = socket.data.userId;
            if (!userId) return;

            console.log(`Usuario conectado: ${userId}`);

            // Unirse a la sala de stream
            socket.on('join-stream', (streamId) => {
                socket.join(streamId); // Unir al usuario a la sala
                console.log(`Usuario ${userId} se unió al stream ${streamId}`);
            });

            // Manejo de oferta WebRTC
            socket.on('offer', (streamId, offer) => {
                socket.to(streamId).emit('offer', offer); // Emitir oferta a los demás
            });

            // Manejo de respuesta WebRTC
            socket.on('answer', (streamId, answer) => {
                socket.to(streamId).emit('answer', answer); // Emitir respuesta a los demás
            });

            // Manejo de candidatos ICE
            socket.on('ice-candidate', (streamId, candidate) => {
                socket.to(streamId).emit('ice-candidate', candidate); // Emitir candidato ICE
            });

            // Desconexión
            socket.on('disconnect', () => {
                console.log(`Usuario desconectado: ${userId}`);
            });
        });
    }

    private initRoutes(): void {
        this.app.getAppServer().get(`${this.route}/streams`, authMiddleware, this.getStreams.bind(this));
    }

    private async getStreams(req: Request, res: Response): Promise<Response> {
        try {
            const streams = await this.streamModel.find(); // Utilizar el modelo Stream para obtener los streams
            return res.status(StatusCodes.OK).json({ streams });
        } catch (error) {
            console.error('Error obteniendo streams:', error);
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener los streams' });
        }
    }
}

export default StreamController;

