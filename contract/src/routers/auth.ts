import { initContract } from "@ts-rest/core"
import { zUserName, zUserPassword } from "../zod/user.zod"
import { z } from "zod"
import { getErrorsForContract } from "../errors"

const c = initContract()

export const authContract = c.router(
	{
		logout: {
			method: "GET",
			path: "/logout",
			responses: {
				200: c.type<null>(),
			},
		},
		login: {
			method: "POST",
			path: "/login",
			body: z.strictObject({
				code: z.string(),
				redirect_uri: z.string().url(),
			}),
			responses: {
				200: z.object({
					username: zUserName,
					intraUserName: z.string(),
				}),
				...getErrorsForContract(c,
                    [200, "TwoFATokenNeeded"],
                    [403, "Invalid42ApiCode"],
                    [404, "NotRegisteredUser"]
                ),
			},
		},
		loginDev: {
			method: "POST",
			path: "/loginDev",
			body: z.object({
				username: zUserName,
			}),
			responses: {
				200: z.object({
					username: zUserName,
					intraUserName: z.string(),
				}),
				404: z.object({
					code: z.literal("NotFound"),
				}),
				...getErrorsForContract(c, [403, "ForbiddenByEnv"]),
			},
			description: "login route for dev purposes (disabled in prod)",
		},
		refreshTokens: {
			method: "POST",
			path: "/refreshTokens",
			body: c.type<null>(),
			responses: {
				200: c.type<null>(),
				...getErrorsForContract(c, [401, "Unauthorized"]),
			},
		},
	},
	{
		pathPrefix: "/auth",
	},
)
