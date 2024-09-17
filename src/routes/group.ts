// src/routes/groupController.ts
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import mongoose, { Types } from 'mongoose'; // Importa mongoose para usar ObjectId
import { GroupModel, IGroup } from './schemas/group';
import App from '../app';
import { authMiddleware } from '../middlware/authMiddlewares';

interface AuthRequest extends Request {
  userId?: string;
}

export class GroupController {
  private route: string;
  private app: App;
  private groupModel: ReturnType<typeof GroupModel>;

  constructor(app: App, route: string) {
    this.route = route;
    this.app = app;
    this.groupModel = GroupModel(this.app.getClientMongoose());
    this.initRoutes();
  }

  // Inicializa las rutas HTTP
  private initRoutes(): void {
    this.app.getAppServer().post(
      `${this.route}/groups/create`,
      authMiddleware,
      this.createGroup.bind(this)
    );

    this.app.getAppServer().get(
      `${this.route}/groups`,
      authMiddleware,
      this.getGroups.bind(this)
    );

    this.app.getAppServer().post(
      `${this.route}/groups/:groupId/join`,
      authMiddleware,
      this.joinGroup.bind(this)
    );
  }

  // Método para crear un grupo
  private async createGroup(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { name, description } = req.body;
      const createdBy = req.userId;

      const newGroup = new this.groupModel({
        name,
        description,
        members: [new mongoose.Types.ObjectId(createdBy)], // Convertir createdBy a ObjectId
        createdBy: new mongoose.Types.ObjectId(createdBy),
      });

      const savedGroup = await newGroup.save();
      return res.status(StatusCodes.CREATED).json({ group: savedGroup });
    } catch (error) {
      console.error('Error al crear el grupo:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al crear el grupo', error });
    }
  }

  // Método para obtener los grupos del usuario
  private async getGroups(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const userId = req.userId;

      const groups = await this.groupModel.find({ members: new mongoose.Types.ObjectId(userId) }) // Convertir userId a ObjectId
        .populate('members', 'username')
        .exec();
      return res.status(StatusCodes.OK).json({ groups });
    } catch (error) {
      console.error('Error al obtener los grupos:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener los grupos', error });
    }
  }

  // Método para unirse a un grupo
  private async joinGroup(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const userId = new mongoose.Types.ObjectId(req.userId); // Convertir userId a ObjectId
      const { groupId } = req.params;

      const group = await this.groupModel.findById(groupId);
      if (!group) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'Grupo no encontrado' });
      }

      if (!group.members.includes(userId)) {
        group.members.push(userId);
        await group.save();
      }

      return res.status(StatusCodes.OK).json({ group });
    } catch (error) {
      console.error('Error al unirse al grupo:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al unirse al grupo', error });
    }
  }
}

export default GroupController;

