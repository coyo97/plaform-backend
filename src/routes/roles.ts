import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { RoleModel, IRole } from './schemas/role';
import App from '../app';

export class RoleController {
	private route: string;
	private app: App;
	private roleModel: ReturnType<typeof RoleModel>;

	constructor(app: App, route: string) {
		this.route = route;
		this.app = app;
		this.roleModel = RoleModel(this.app.getClientMongoose());
		this.initRoutes();
	}

	private initRoutes(): void {
		this.app.getAppServer().get(`${this.route}/roles`, this.listRoles.bind(this));
		this.app.getAppServer().post(`${this.route}/roles`, this.createRole.bind(this));
		this.app.getAppServer().put(`${this.route}/roles/:id`, this.editRole.bind(this));
		this.app.getAppServer().delete(`${this.route}/roles/:id`, this.deleteRole.bind(this));
	}

	private async listRoles(req: Request, res: Response): Promise<Response> {
		try {
			const roles = await this.roleModel.find().exec();
			return res.status(StatusCodes.OK).json({ roles });
		} catch (error) {
			console.error('Error al listar los roles:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al listar los roles', error });
		}
	}

	private async createRole(req: Request, res: Response): Promise<Response> {
		try {
			const { name, description, permissions } = req.body;
			if (!name || !permissions) {
				return res.status(StatusCodes.BAD_REQUEST).json({ message: 'El nombre y los permisos son obligatorios' });
			}
			const newRole = new this.roleModel({ name, description, permissions });
			const result = await newRole.save();
			return res.status(StatusCodes.CREATED).json({ role: result });
		} catch (error) {
			console.error('Error al crear el rol:', error);
			return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Error al crear el rol', error });
		}
	}

	private async editRole(req: Request, res: Response): Promise<Response> {
		try {
			const { id } = req.params;
			const { name, description, permissions } = req.body;
			const role = await this.roleModel.findByIdAndUpdate(id, { name, description, permissions }, { new: true }).exec();
			if (!role) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Rol no encontrado' });
			}
			return res.status(StatusCodes.OK).json({ role });
		} catch (error) {
			console.error('Error al editar el rol:', error);
			return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Error al editar el rol', error });
		}
	}

	private async deleteRole(req: Request, res: Response): Promise<Response> {
		try {
			const { id } = req.params;
			const role = await this.roleModel.findByIdAndDelete(id).exec();
			if (!role) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Rol no encontrado' });
			}
			return res.status(StatusCodes.OK).json({ message: 'Rol eliminado correctamente' });
		} catch (error) {
			console.error('Error al eliminar el rol:', error);
			return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Error al eliminar el rol', error });
		}
	}
}

