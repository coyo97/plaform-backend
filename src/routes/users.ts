import { Express } from "express";
import * as dotenv from "dotenv";
import { StatusCodes } from "http-status-codes";
import App from '../app';
import { UserModel, IUser } from "./schemas/user";
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
            const list = await this.user.find();
            res.status(StatusCodes.ACCEPTED).json({ list });
        });

        // Ruta para registrar un nuevo usuario
        this.express.post(this.route, async (req, res) => {
            const { username, email, password } = req.body;
            const saltRounds = 10;

            try {
                // Hashear la contraseña antes de guardar
                const hashedPassword = await bcrypt.hash(password, saltRounds);
                const roles: any = { name: 'admi', description: 'user', permissions: ['user'] };
                const rolesList = [];
                rolesList.push(roles);
                const requestObject = { username, email, password: hashedPassword, roles: rolesList };
                const newUser = new this.user(requestObject);
                const result = await newUser.save();

                if (result) {
                    res.status(StatusCodes.CREATED).json({ msg: "User created" });
                    return;
                }

                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "User not created" });
            } catch (error) {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Error creating user", error });
            }
        });

        // Ruta para actualizar un usuario
        this.express.put(`${this.route}/:id`, async (req, res) => {
            const { email } = req.body;
            const { id } = req.params;
            const result = await this.user.findOneAndUpdate({ _id: id }, { email: email });
            res.status(StatusCodes.OK).json({ msg: 'User service' });
        });

        // Ruta para eliminar un usuario
        this.express.delete(`${this.route}/:id`, async (req, res) => {
            const { id } = req.params;
            const result = await this.user.findOneAndDelete({ _id: id });
            res.status(StatusCodes.OK).json({ msg: result });
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
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al procesar la solicitud', error });
            }
        });
    }
}

