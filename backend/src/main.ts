import { HttpAdapterHost, NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger"
import * as cookieParser from "cookie-parser"
import { SwaggerTheme } from "swagger-themes"
import { PrismaClientExceptionFilter, CustomPrismaService } from "nestjs-prisma"
import { generateOpenApi } from "@ts-rest/open-api"
import { contract } from "contract"
import { HttpStatus } from "@nestjs/common"
import { join } from "path"

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		// bodyParser: true,
		// httpsOptions:
		// {
		// 	key: fs.readFileSync('./secrets/key.pem'),
		// 	cert: fs.readFileSync('./secrets/cert.pem'),
		// },
		// cors:
		// {
		// 	credentials: true,
		// 	origin: ['https://localhost:3000', 'https://localhost:5173', 'https://localhost'],
		// }
	})

	app.use(cookieParser())
	const config = new DocumentBuilder().setTitle("APIchat").setVersion("0.42").build()
	const theme = new SwaggerTheme("v3")
	const options = {
		customCss: theme.getBuffer("dark"),
	}
	const document = overrideTsRestGeneratedTags(
		generateOpenApi(contract, config, { setOperationId: true, jsonQuery: true }),
	)
	SwaggerModule.setup("api", app, document, options)

    // TODO : patch this with custom client location
	// const prismaService: PrismaService = app.get(PrismaService)
	// prismaService.$on("query", (event) => {
	// 	console.log(event)
	// })

	const { httpAdapter } = app.get(HttpAdapterHost)
	app.useGlobalFilters(
		new PrismaClientExceptionFilter(httpAdapter, {
			P2003: HttpStatus.NOT_FOUND,
		}),
	)

	await app.listen(3000)
}

// TODO: make this function a bit cleaner and put it somewhere else
function overrideTsRestGeneratedTags(document: OpenAPIObject) {
	for (const path of Object.values(document.paths)) {
		for (const subpath of Object.values(path)) {
			if (!subpath["tags"]) continue
			const oldTags = subpath.tags as string[]
			if (oldTags.length < 2) continue
			let res = ""
			let newTags: string[] = []
			for (const tag of oldTags) {
				res = join(res, tag)
				newTags.push(res)
			}
			subpath.tags = newTags
		}
	}
	return document
}

bootstrap()
