
import App from "./app";
import * as dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}
//todo: es necesario que revisemos todas las variables de entorno antes de ejecutar el servidor: porque si nos llegas
//una variable de entorno como indefinido podemos hacerlo caer todo el servidor: si no existe una variable parar todo
const server: App = new App(); 
server.getAppServer().listen(server.getPort(), () => {
	console.log(`App is running at http://localhost: ${process.env.PORT} in ${process.env.NODE_ENV} mode`);
})
