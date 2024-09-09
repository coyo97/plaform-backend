import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { PublicationModel, IPublication } from './schemas/publication'; // Ajusta la ruta según tu estructura
import App from '../app';
import mongoose from 'mongoose';
import { authMiddleware } from '../middlware/authMiddlewares';

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
	this.app.getAppServer().post(`${this.route}/publications`, authMiddleware, this.createPublication.bind(this));
    this.app.getAppServer().post(`${this.route}/publications`, this.createPublication.bind(this));

    // Ruta para obtener todas las publicaciones
    this.app.getAppServer().get(`${this.route}/publications`, this.listPublications.bind(this));

    // Ruta para actualizar una publicación existente
    this.app.getAppServer().put(`${this.route}/publications/:id`, this.updatePublication.bind(this));

    // Ruta para eliminar una publicación
    this.app.getAppServer().delete(`${this.route}/publications/:id`, this.deletePublication.bind(this));
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
// Método para crear una nueva 
  private async createPublication(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { title, content, tags } = req.body;
      const userId = req.userId;

      if (!userId) {
        return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
      }

      if (!title || !content) {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'El título y contenido son obligatorios' });
      }

      const newPublication = new this.publicationModel({ title, content, author: userId, tags });
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
}

