const FindMyWay = require("find-my-way");
const http = require("http");
const util = require("util");
const fs = require("fs");
const path = require("path");
const url = require("url");

const LOCALHOST = "127.0.0.1";
const FAILED_RESPONSE_CONTENT_TYPE = "application/json";
const STATIC_FILE_RESPONSE_CONTENT_TYPE = "application/octet-stream";

const isPathWithoutInvalidCharacters = (parametersPath) => {
	if (parametersPath.indexOf("\0") !== -1 || parametersPath.indexOf("$") !== -1 || parametersPath.indexOf("@") !== -1 || parametersPath.indexOf("../") !== -1)
		return false;
	else 
		return true;
};

const isPathInBaseFolderBound = (parametersPath, filesBasePath) => {
	const globPath = path.join(filesBasePath, path.normalize(parametersPath));
	if (!(globPath.substring(0, filesBasePath.length) === filesBasePath))
		return false;
	else 
		return true;
};

const internalServerErrorHandler = (_request, response) => {
	response.statusCode = 500;
	response.setHeader("Content-Type", FAILED_RESPONSE_CONTENT_TYPE);
	response.end({ code: 500, message: http.STATUS_CODES[500]});
};

const forbiddenErrorHandler = (_request, response) => {
	response.statusCode = 403;
	response.setHeader("Content-Type", FAILED_RESPONSE_CONTENT_TYPE);
	response.end({ code: 403, message: http.STATUS_CODES[403]});
};

class LocalhostServer {
	// eslint-disable-next-line unicorn/prevent-abbreviations
	constructor(port, maxParamLength = 600, caseSensitive = true, debugMode = false) {
		if(!port) throw new Error("Invalid port");
		
		this._httpServer = null;
		this._port = Number(port);
		this._debug = debugMode;

		this._router = new FindMyWay({
			maxParamLength,
			caseSensitive,
			defaultRoute: (_request, response) => {
				response.statusCode = 404;
				response.setHeader("Content-Type", FAILED_RESPONSE_CONTENT_TYPE);
				response.end({ code: 404, message: http.STATUS_CODES[404]});
			},
			onBadUrl: (_path, _request, response) => {
				response.statusCode = 403;
				response.setHeader("Content-Type", FAILED_RESPONSE_CONTENT_TYPE);
				response.end({ code: 403, message: http.STATUS_CODES[403]});
			}
		});
	}

	serveFolder(route, folderFullPath) {
		let routeOpt = route;
		if(typeof routeOpt !== "string" || routeOpt.length === 0 || routeOpt === "*" || !isPathWithoutInvalidCharacters(routeOpt)) throw new Error("invalid route path");
		if(typeof folderFullPath !== "string" || !path.isAbsolute(folderFullPath)) throw new Error("invalid folder path");
		if(!routeOpt.endsWith("/*")) routeOpt = `${routeOpt}/*`;
		
		this._router.on("GET", routeOpt, (request, response, parameters) => {
			if(this._debug) console.log(`Date: ${Date.now()}`, `path: ${request.url}`);
		
			if(typeof parameters !== "object" || !parameters["*"] || !isPathWithoutInvalidCharacters(parameters["*"]) || !isPathInBaseFolderBound(parameters["*"], folderFullPath)) {
				forbiddenErrorHandler(request, response);
			}
			const requestPath = path.join(folderFullPath, path.normalize(parameters["*"]));
			try {
				response.statusCode = 200;
				response.setHeader("Content-Type", STATIC_FILE_RESPONSE_CONTENT_TYPE);
				const stream = fs.createReadStream(requestPath);
				stream.on("error", () => {
					internalServerErrorHandler(request, response);
				});
				stream.pipe(response);
			}
			catch(error) {
				internalServerErrorHandler(request, response);
			}
		});
	}

	serveCustomCallbackRoute(method, route, callback, isReturnData) {
		this._router.on(method.toUpperCase(), route, (request, response, parameters) => {
			if(this._debug) console.log(`Date: ${Date.now()}`, `path:${request.url}`);
			try {
				if(isReturnData) {
				
					const data = callback(parameters, (new url.URL(`http://${LOCALHOST}${request.path}`)).searchParams);
					response.statusCode = 200;
					response.end(data);
				}
				else {
					callback(parameters, (new url.URL(`http://${LOCALHOST}${request.path}`)).searchParams);
					response.statusCode = 204;
					response.end();
				}
			} catch(error) {
				internalServerErrorHandler(request, response);
			}
		});
	}
	
	serveRawRoute(method, route, callback) {
		this._router.on(method.toUpperCase(), route, callback);
	}
	
	async start() {
		if(this._httpServer && this._httpServer.listening) throw new Error("Already listening");

		this._httpServer = http.createServer((request, response) => {
			this._router.lookup(request, response);
		});
		const promisifiedListen= util.promisify(this._httpServer.listen.bind(this._httpServer));
		await promisifiedListen(this._port, LOCALHOST);

	}

	async stop() {
		if(!this._httpServer || this._httpServer.listening) throw new Error("Server stopped");
		const promisifiedClose = util.promisify(this._httpServer.stop.bind(this._httpServer));
		await promisifiedClose();
	}
}

module.exports = LocalhostServer;