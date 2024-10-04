// src/routes/comments.ts
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { CommentModel } from './schemas/comment';
import App from '../app';
import { authMiddleware } from '../middlware/authMiddlewares';

import { analyzeComment } from '../moderation/text/toxicityService';
import { translateText } from '../moderation/text/translationService';


interface AuthRequest extends Request {
    userId?: string;
}

export class CommentController {
    private route: string;
    private app: App;
    private commentModel: ReturnType<typeof CommentModel>;

    constructor(app: App, route: string) {
        this.route = route;
        this.app = app;
        this.commentModel = CommentModel(this.app.getClientMongoose());
        this.initRoutes();
    }

    private initRoutes(): void {
        // Route to get comments for a specific publication
        this.app.getAppServer().get(
            `${this.route}/publications/:publicationId/comments`,
            authMiddleware,
            this.getComments.bind(this)
        );

        // Route to create a comment for a specific publication
        this.app.getAppServer().post(
            `${this.route}/publications/:publicationId/comments`,
            authMiddleware,
            this.createComment.bind(this)
        );

		// Route to edit a comment
    this.app.getAppServer().put(
        `${this.route}/comments/:commentId`,
        authMiddleware,
        this.editComment.bind(this)
    );

    // Route to delete a comment
    this.app.getAppServer().delete(
        `${this.route}/comments/:commentId`,
        authMiddleware,
        this.deleteComment.bind(this)
    );
    }

    private async getComments(req: AuthRequest, res: Response): Promise<Response> {
        try {
            const { publicationId } = req.params;
            const comments = await this.commentModel.find({ publication: publicationId }).populate('author').exec();
            return res.status(StatusCodes.OK).json({ comments });
        } catch (error) {
            console.error('Error fetching comments:', error);
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error fetching comments', error });
        }
    }


private async createComment(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const { publicationId } = req.params;
	const { content, language = 'es' } = req.body;  // Si no se proporciona, asume 'es' por defecto

    const userId = req.userId;

    console.log('Contenido original:', content);
    console.log('Idioma proporcionado:', language);

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'User not authenticated' });
    }

    let translatedContent = content;

    if (language && language !== 'en') {
      try {
        translatedContent = await translateText(content, 'en');
        console.log('Contenido traducido:', translatedContent);
      } catch (error) {
        console.error('Error en la traducción:', error);
        // Puedes decidir si continuar con el contenido original o rechazar el comentario
        // return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error translating comment' });
      }
    } else {
      console.log('No se requiere traducción');
    }

    // Analizar si el comentario es inapropiado
    const isInappropriate = await analyzeComment(translatedContent);
    console.log(`Resultado del análisis: ${isInappropriate}`);

    if (isInappropriate) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Inappropriate comment detected' });
    }

    // Guardar el comentario si es apropiado
    const newComment = new this.commentModel({
      content,
      author: userId,
      publication: publicationId,
    });

    const savedComment = await newComment.save();
    return res.status(StatusCodes.CREATED).json({ comment: savedComment });
  } catch (error) {
    console.error('Error creating comment:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error creating comment', error });
  }
}


	// Método para editar un comentario
private async editComment(req: AuthRequest, res: Response): Promise<Response> {
    try {
        const { commentId } = req.params;
        const { content } = req.body;
        const userId = req.userId;

        if (!userId) {
            return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'User not authenticated' });
        }

        // Verifica si el comentario pertenece al usuario autenticado
        const comment = await this.commentModel.findOne({ _id: commentId, author: userId }).exec();

        if (!comment) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Comment not found or you are not the author' });
        }

        comment.content = content;
        const updatedComment = await comment.save();

        return res.status(StatusCodes.OK).json({ comment: updatedComment });
    } catch (error) {
        console.error('Error editing comment:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error editing comment', error });
    }
}

// Método para eliminar un comentario
private async deleteComment(req: AuthRequest, res: Response): Promise<Response> {
    try {
        const { commentId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'User not authenticated' });
        }

        // Verifica si el comentario pertenece al usuario autenticado
        const comment = await this.commentModel.findOneAndDelete({ _id: commentId, author: userId }).exec();

        if (!comment) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Comment not found or you are not the author' });
        }

        return res.status(StatusCodes.OK).json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Error deleting comment:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error deleting comment', error });
    }
}

}

