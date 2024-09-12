import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { PublicationModel, IPublication } from './schemas/publication';
import App from '../app';
import { authMiddleware } from '../middlware/authMiddlewares';
import { upload } from '../middlware/upload';

interface AuthRequest extends Request {
	userId?: string;
}

export class PublicationController {
	private route: string;
	private app: App;
	private publicationModel: ReturnType<typeof PublicationModel>;

	constructor(app: App, route: string) {
		this.route = route;
		this.app = app;
		this.publicationModel = PublicationModel(this.app.getClientMongoose());
		this.initRoutes();
	}

	private initRoutes(): void {
		// Ruta para crear una nueva publicación
		this.app.getAppServer().post(
			`${this.route}/publications`,
			authMiddleware, // Primero autenticación
			upload.single('file'), // Luego subida de archivos
			this.createPublication.bind(this)
		);

		// Ruta para obtener todas las publicaciones
		this.app.getAppServer().get(
			`${this.route}/publications`,
			authMiddleware, // Asegura autenticación para ver publicaciones
			this.listPublications.bind(this)
		);

		// Ruta para actualizar una publicación existente
		this.app.getAppServer().put(
			`${this.route}/publications/:id`,
			authMiddleware,
			this.updatePublication.bind(this)
		);

		// Ruta para eliminar una publicación
		this.app.getAppServer().delete(
			`${this.route}/publications/:id`,
			authMiddleware,
			this.deletePublication.bind(this)
		);
		 // Ruta para obtener las publicaciones del usuario autenticado
    this.app.getAppServer().get(
        `${this.route}/user-publications`, // Nueva ruta
        authMiddleware,
        this.listUserPublications.bind(this) // Llama al método que filtra por usuario autenticado
    );
	}

	// Método para listar todas las publicaciones
	private async listPublications(req: Request, res: Response): Promise<void> {
		try {
			const publications = await this.publicationModel.find().populate('author').exec();
			res.status(StatusCodes.OK).json({ publications });
		} catch (error) {
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al listar las publicaciones', error });
		}
	}

	// Método para crear una nueva publicación
	private async createPublication(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { title, content, tags } = req.body;
			const userId = req.userId;
			const file = req.file;

			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			if (!title || !content) {
				return res.status(StatusCodes.BAD_REQUEST).json({ message: 'El título y contenido son obligatorios' });
			}

			const newPublication = new this.publicationModel({
				title,
				content,
				author: userId,
				tags,
				filePath: file?.path,
				fileType: file?.mimetype,
			});
			const result = await newPublication.save();

			return res.status(StatusCodes.CREATED).json({ publication: result });
		} catch (error) {
			console.error('Error al crear la publicación:', error);
			return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Error al crear la publicación', error });
		}
	}

	// Método para actualizar una publicación existente
	private async updatePublication(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const { title, content, tags } = req.body;
			const updatedPublication = await this.publicationModel.findByIdAndUpdate(
				id,
				{ title, content, tags },
				{ new: true }
			).exec();
			res.status(StatusCodes.OK).json({ publication: updatedPublication });
		} catch (error) {
			res.status(StatusCodes.BAD_REQUEST).json({ message: 'Error al actualizar la publicación', error });
		}
	}

	// Método para eliminar una publicación
	private async deletePublication(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			await this.publicationModel.findByIdAndDelete(id).exec();
			res.status(StatusCodes.OK).json({ message: 'Publicación eliminada correctamente' });
		} catch (error) {
			res.status(StatusCodes.BAD_REQUEST).json({ message: 'Error al eliminar la publicación', error });
		}
	}
// Cambia el tipo de retorno de Promise<void> a Promise<Response>
private async listUserPublications(req: AuthRequest, res: Response): Promise<Response> {
    try {
        const userId = req.userId; // Obtén el userId del usuario autenticado
        
        if (!userId) {
            return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
        }

        // Filtra las publicaciones por el userId del usuario autenticado
        const publications = await this.publicationModel.find({ author: userId }).exec();

        return res.status(StatusCodes.OK).json({ publications });
    } catch (error) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al listar las publicaciones del usuario', error });
    }
}

}

