import { Express } from "express";
import * as dotenv from "dotenv";
import { StatusCodes } from "http-status-codes";
import App from '../app';
import { UserModel, IUser } from "./schemas/user";
import { RoleModel, IRole } from './schemas/role';
import { Model } from "mongoose";
import bcrypt from 'bcrypt';
import { generateToken } from "../authentication/authUser";

if (process.env.NODE_ENV !== "production") {
    dotenv.config();
}

export class UserController {
    private route: string;
    private app: App;
    private express: Express;
    private user: Model<IUser>;

    constructor(app: App, route: string) {
        this.route = route;
        this.app = app;
        this.express = this.app.getAppServer();
        this.user = UserModel(this.app.getClientMongoose());
        this.initRoutes();
        console.log(`User Controller initialized at ${this.route}`);
    }

    private initRoutes(): void {
        console.log(`User Controller initialized at ${this.route}`);

        // Ruta para obtener la lista de usuarios
        this.express.get(this.route, async (req, res) => {
            try {
                const list = await this.user.find().populate('roles');
                res.status(StatusCodes.ACCEPTED).json({ list });
            } catch (error) {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Error fetching users", error });
            }
        });

        // Ruta para registrar un nuevo usuario
        this.express.post(this.route, async (req, res) => {
            const { username, email, password } = req.body;
            const saltRounds = 10;

            try {
                // Hashear la contraseña antes de guardar
                const hashedPassword = await bcrypt.hash(password, saltRounds);

                // Verificar y asignar el rol de usuario básico si no existe un rol específico
                let role: IRole | null = await RoleModel(this.app.getClientMongoose()).findOne({ name: 'admi' }).exec();

                // Si no existe el rol, puedes crear uno por defecto o manejar el error
                if (!role) {
                    // Opcional: Crear un rol 'user' básico
                    role = new (RoleModel(this.app.getClientMongoose()))({
                        name: 'admi',
                        description: 'Usuario básico',
                        permissions: [{ name: 'basic_access', description: 'Acceso básico' }],
                    });
                    await role.save();
                }

                // Asignar el rol encontrado o creado al usuario
                const requestObject = { username, email, password: hashedPassword, roles: [role._id] };
                const newUser = new this.user(requestObject);
                const result = await newUser.save();

                if (result) {
                    res.status(StatusCodes.CREATED).json({ msg: "User created" });
                    return;
                }

                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "User not created" });
            } catch (error) {
                console.error('Error creating user:', error);
                res.status(StatusCodes.BAD_REQUEST).json({ msg: "Error creating user", error });
            }
        });

        // Ruta para actualizar un usuario
        this.express.put(`${this.route}/:id`, async (req, res) => {
            const { email } = req.body;
            const { id } = req.params;
            try {
                const result = await this.user.findOneAndUpdate({ _id: id }, { email });
                res.status(StatusCodes.OK).json({ msg: 'User updated' });
            } catch (error) {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Error updating user", error });
            }
        });

        // Ruta para eliminar un usuario
        this.express.delete(`${this.route}/:id`, async (req, res) => {
            const { id } = req.params;
            try {
                const result = await this.user.findOneAndDelete({ _id: id });
                res.status(StatusCodes.OK).json({ msg: 'User deleted', result });
            } catch (error) {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Error deleting user", error });
            }
        });

        // Inicializar la ruta de login
        this.initLoginRoute();
    }

    // Ruta para iniciar sesión
    public initLoginRoute(): void {
        this.express.post(`${this.route}/login`, async (req, res) => {
            const { email, password } = req.body;

            try {
                const user = await this.user.findOne({ email }).exec();
                if (!user) {
                    return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no encontrado' });
                }

                // Comparar la contraseña ingresada con el hash almacenado
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Contraseña incorrecta' });
                }

                const token = generateToken(user._id.toString());
                res.status(StatusCodes.OK).json({ token });
            } catch (error) {
                console.error('Error logging in:', error);
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al procesar la solicitud', error });
            }
        });
    }
}

