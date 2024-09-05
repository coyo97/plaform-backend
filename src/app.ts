import express, { Express } from "express";
import {parseEnvNumber, parseEnvString} from "./utils";
import { UserController } from "./routes/users";
import * as dotenv from "dotenv";
import  mongoose, {Mongoose, connection} from 'mongoose';
import cors from 'cors';

if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}
export default class App {
	private appServer: Express;
	private port: number = parseEnvNumber('PORT' || '');
	private apiVersion: string = parseEnvString('API_VERSION' || '');
	private apiPrefix: string = parseEnvString('API_PREFIX' || '');
	private databasePort:number = parseEnvNumber('DATABASE_PORT' || '');
	private databaseHost: string = parseEnvString('DATABASE_HOST' || '');
	private databaseUser: string = parseEnvString('DATABASE_USER' || '');
	private databasePassword: string = parseEnvString('DATABASE_PASSWORD' || '');
	private databaseName: string = parseEnvString('DATABASE_NAME' || '');
	private databaseClient: Mongoose;
	constructor() {
		this.databaseClient = mongoose;
		this.appServer = express();
		this.setupServer();
	}
	private setupServer(): void{
		console.log(`App is running at http://localhost:${this.port}`);
		this.appServer.use(cors());
		this.appServer.use(express.json());
		this.appServer.use(express.urlencoded({extended: true}));//para habilitar el ruteo
		this.setupDatabase();
		this.initRoutes('users')
	}
	private initRoutes(service: string): void {
		//this.appServer.use(`${this.apiPrefix}/${this.apiVersion}/${service}`, userRoute);//creando ruta
		const userController = new UserController(this, `/${this.apiVersion}/${this.apiPrefix}/${service}`);
		userController.initLoginRoute();
	}
	private async setupDatabase() {
		const connectionString = `mongodb://${this.databaseUser}:${this.databasePassword}@${this.databaseHost}:${this.databasePort}/${this.databaseName}`;
			console.log('connection', connectionString);
			const connected = await mongoose.connect(connectionString);
		if(connected) {
			console.log('Database connected successfully');
		}
		this.databaseClient.connect(connectionString);

		this.databaseClient.connection.on("error", (error) => {
			console.log(error);
		});

		this.databaseClient.connection.once("open", () => {
			console.log("Connected to database");
		});
	}
	public getAppServer(): Express {
		return this.appServer;
	}
	public getPort():number {
		return this.port;
	}
	public getClientMongoose(): Mongoose {
		return this.databaseClient;
	}
}
