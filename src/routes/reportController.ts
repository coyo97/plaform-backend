// src/routes/reportController.ts
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ReportModel } from './schemas/report';
import { UserModel } from './schemas/user';
import App from '../app';
import { authMiddleware, adminMiddleware } from '../middlware/authMiddlewares';

interface AuthRequest extends Request {
  userId?: string;
}

export class ReportController {
  private route: string;
  private app: App;
  private reportModel: ReturnType<typeof ReportModel>;

  constructor(app: App, route: string) {
    this.route = route;
    this.app = app;
    this.reportModel = ReportModel(this.app.getClientMongoose());
    this.initRoutes();
  }

  private initRoutes(): void {
    // Ruta para obtener todos los reportes (solo administradores)
    this.app.getAppServer().get(
      `${this.route}/reports`,
      authMiddleware,
      this.getReports.bind(this)
    );

    // Ruta para actualizar el estado de un reporte (solo administradores)
    this.app.getAppServer().put(
      `${this.route}/reports/:id`,
      authMiddleware,
      this.updateReportStatus.bind(this)
    );
  }

  // Método para obtener todos los reportes
  private async getReports(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const reports = await this.reportModel.find()
        .populate('reporter', 'username')
        .populate({
          path: 'publication',
          populate: { path: 'author', select: 'username' },
        })
        .exec();

      return res.status(StatusCodes.OK).json({ reports });
    } catch (error) {
      console.error('Error al obtener los reportes:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener los reportes', error });
    }
  }

  // Método para actualizar el estado de un reporte
  private async updateReportStatus(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['pending', 'reviewed', 'dismissed'].includes(status)) {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Estado inválido' });
      }

      const report = await this.reportModel.findById(id).exec();

      if (!report) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'Reporte no encontrado' });
      }

      report.status = status;
      await report.save();

      return res.status(StatusCodes.OK).json({ message: 'Reporte actualizado', report });
    } catch (error) {
      console.error('Error al actualizar el reporte:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al actualizar el reporte', error });
    }
  }
}

