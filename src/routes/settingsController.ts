// src/routes/settingsController.ts
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { SettingsModel } from './schemas/settings';
import App from '../app';
import { authMiddleware, adminMiddleware } from '../middlware/authMiddlewares';

interface AuthRequest extends Request {
  userId?: string;
}

export class SettingsController {
  private route: string;
  private app: App;
  private settingsModel: ReturnType<typeof SettingsModel>;

  constructor(app: App, route: string) {
    this.route = route;
    this.app = app;
    this.settingsModel = SettingsModel(this.app.getClientMongoose());
    this.initRoutes();
  }

  private initRoutes(): void {
    // Ruta para obtener las configuraciones
    this.app.getAppServer().get(
      `${this.route}/settings`,
      authMiddleware,
      this.getSettings.bind(this)
    );

    // Ruta para actualizar las configuraciones
    this.app.getAppServer().put(
      `${this.route}/settings`,
      authMiddleware,
      this.updateSettings.bind(this)
    );
  }

  // Método para obtener las configuraciones
  private async getSettings(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const settings = await this.settingsModel.findOne().exec();
      return res.status(StatusCodes.OK).json({ settings });
    } catch (error) {
      console.error('Error al obtener las configuraciones:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener las configuraciones', error });
    }
  }

  // Método para actualizar las configuraciones
  private async updateSettings(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { aiModerationEnabled, commentModerationEnabled, maxUploadSize } = req.body;

      let settings = await this.settingsModel.findOne().exec();

      if (!settings) {
        settings = new this.settingsModel({
          aiModerationEnabled,
          commentModerationEnabled,
          maxUploadSize,
        });
      } else {
        if (typeof aiModerationEnabled === 'boolean') settings.aiModerationEnabled = aiModerationEnabled;
        if (typeof commentModerationEnabled === 'boolean') settings.commentModerationEnabled = commentModerationEnabled;
        if (typeof maxUploadSize === 'number') settings.maxUploadSize = maxUploadSize;
      }

      await settings.save();

      return res.status(StatusCodes.OK).json({ message: 'Configuraciones actualizadas', settings });
    } catch (error) {
      console.error('Error al actualizar las configuraciones:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al actualizar las configuraciones', error });
    }
  }
}

