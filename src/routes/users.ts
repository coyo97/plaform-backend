import { Express } from "express";
import * as dotenv from "dotenv";
import {StatusCodes} from "http-status-codes";
import App from '../app';
import { UserModel, IUser } from "./schemas/user";
import {Model, Schema} from "mongoose";

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
		this.express.get(this.route, async(req, res) => {
			const list = await this.user.find();
			res.status(StatusCodes.ACCEPTED).json({list});
		});

		this.express.post(this.route, async(req, res) => {
			//todo sanitize req.body 1 
			//todo validate req.body 2 
			//todo create user model 3
			const roles: any = {name: 'admi', description: 'user', permissions: ['user']};
			const rolesList = [];
			rolesList.push(roles)
			const requestObject = {...req.body, roles: rolesList};
			const newUser = new this.user(requestObject);
			const result = await newUser.save();
			if(result) {
				res.status(StatusCodes.CREATED).json({msg: "user created"})
				return;
			}
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({msg: "no created"});
		});

		this.express.put(`${this.route}/:id`, async(req, res) => {
			const {email} = req.body;
			const { id } = req.params;
			const result = await this.user.findOneAndUpdate({_id: id}, { email: email}); 
			res.status(StatusCodes.OK).json({msg: 'User service'});
		});

		this.express.delete(`${this.route}/:id`, async(req, res) => {
			const {id} = req.params;
			const result = await this.user.findOneAndDelete({_id: id})
			res.status(StatusCodes.OK).json({msg: result});
		});
	}
}
