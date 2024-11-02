// src/routes/permissionsController.ts
import { Request, Response } from 'express';
import { ModuleModel } from './schemas/module';
import { ActionModel } from './schemas/action';
import App from '../app';
import { authMiddleware, adminMiddleware } from '../middlware/authMiddlewares';
import { body, validationResult } from 'express-validator';

export class PermissionsController {
	private route: string;
	private moduleModel: ReturnType<typeof ModuleModel>;
	private actionModel: ReturnType<typeof ActionModel>;
	private app: App;

	constructor(app: App, route: string) {
		this.route = route;
		this.app = app;
		this.moduleModel = ModuleModel(this.app.getClientMongoose());
		this.actionModel = ActionModel(this.app.getClientMongoose());
		this.initRoutes();
	}

	private initRoutes(): void {

				// Obtener módulos y acciones
		this.app.getAppServer().get(`${this.route}/permissions`, authMiddleware, adminMiddleware, this.getPermissions.bind(this));

		// Rutas para módulos
		this.app.getAppServer().post(
			`${this.route}/modules`,
			authMiddleware,
			adminMiddleware,
			[body('name').notEmpty().withMessage('El nombre es obligatorio')],
			this.createModule.bind(this)
		);

		this.app.getAppServer().put(
			`${this.route}/modules/:id`,
			authMiddleware,
			adminMiddleware,
			[body('name').notEmpty().withMessage('El nombre es obligatorio')],
			this.updateModule.bind(this)
		);

		this.app.getAppServer().delete(
			`${this.route}/modules/:id`,
			authMiddleware,
			adminMiddleware,
			this.deleteModule.bind(this)
		);

		// Rutas para acciones
		this.app.getAppServer().post(
			`${this.route}/actions`,
			authMiddleware,
			adminMiddleware,
			[body('name').notEmpty().withMessage('El nombre es obligatorio')],
			this.createAction.bind(this)
		);

		this.app.getAppServer().put(
			`${this.route}/actions/:id`,
			authMiddleware,
			adminMiddleware,
			[body('name').notEmpty().withMessage('El nombre es obligatorio')],
			this.updateAction.bind(this)
		);

		this.app.getAppServer().delete(
			`${this.route}/actions/:id`,
			authMiddleware,
			adminMiddleware,
			this.deleteAction.bind(this)
		);

	}

	// Métodos para módulos
	private async createModule(req: Request, res: Response): Promise<void> {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const { name } = req.body;
			const module = new this.moduleModel({ name });
			await module.save();
			res.status(201).json({ module });
		} catch (error) {
			console.error('Error al crear módulo:', error);
			res.status(500).json({ message: 'Error al crear módulo' });
		}
	}

	private async updateModule(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const { name } = req.body;
			const module = await this.moduleModel.findByIdAndUpdate(id, { name }, { new: true });
			if (!module) {
				res.status(404).json({ message: 'Módulo no encontrado' });
				return;
			}
			res.status(200).json({ module });
		} catch (error) {
			console.error('Error al actualizar módulo:', error);
			res.status(500).json({ message: 'Error al actualizar módulo' });
		}
	}

	private async deleteModule(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const module = await this.moduleModel.findByIdAndDelete(id);
			if (!module) {
				res.status(404).json({ message: 'Módulo no encontrado' });
				return;
			}
			res.status(200).json({ message: 'Módulo eliminado' });
		} catch (error) {
			console.error('Error al eliminar módulo:', error);
			res.status(500).json({ message: 'Error al eliminar módulo' });
		}
	}

	// Métodos para acciones
	private async createAction(req: Request, res: Response): Promise<void> {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			res.status(400).json({ errors: errors.array() });
			return;
		}

		try {
			const { name } = req.body;
			const action = new this.actionModel({ name });
			await action.save();
			res.status(201).json({ action });
		} catch (error) {
			console.error('Error al crear acción:', error);
			res.status(500).json({ message: 'Error al crear acción' });
		}
	}

	private async updateAction(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const { name } = req.body;
			const action = await this.actionModel.findByIdAndUpdate(id, { name }, { new: true });
			if (!action) {
				res.status(404).json({ message: 'Acción no encontrada' });
				return;
			}
			res.status(200).json({ action });
		} catch (error) {
			console.error('Error al actualizar acción:', error);
			res.status(500).json({ message: 'Error al actualizar acción' });
		}
	}

	private async deleteAction(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const action = await this.actionModel.findByIdAndDelete(id);
			if (!action) {
				res.status(404).json({ message: 'Acción no encontrada' });
				return;
			}
			res.status(200).json({ message: 'Acción eliminada' });
		} catch (error) {
			console.error('Error al eliminar acción:', error);
			res.status(500).json({ message: 'Error al eliminar acción' });
		}
	}

	// Método existente para obtener módulos y acciones
	private async getPermissions(req: Request, res: Response): Promise<void> {
		try {
			const modules = await this.moduleModel.find().exec();
			const actions = await this.actionModel.find().exec();
			res.status(200).json({
				modules: modules.map(mod => ({ id: mod._id, name: mod.name })),
				actions: actions.map(act => ({ id: act._id, name: act.name })),
			});
		} catch (error) {
			console.error('Error al obtener permisos:', error);
			res.status(500).json({ message: 'Error al obtener permisos' });
		}
	}
}

