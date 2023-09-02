import { Controller, Request, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "src/auth/jwt-auth.guard"
import { FriendsService } from "./friends.service"
import {
	NestControllerInterface,
	NestRequestShapes,
	TsRest,
	TsRestHandler,
	TsRestRequest,
	nestControllerContract,
    tsRestHandler,
} from "@ts-rest/nest"
import { contract } from "contract"
import { EnrichedRequest } from "src/auth/auth.service"
import { isContractError } from "contract"

const c = contract.friends

@TsRest({})
@Controller()
export class FriendsController {
	constructor(private readonly friendsService: FriendsService) {}

    @UseGuards(JwtAuthGuard)
    @TsRestHandler(c)
    async handler(@Request(){ user: { username } }: EnrichedRequest) {
        return tsRestHandler(c, {
            getFriends: async () => {
                const res = await this.friendsService.getFriends(username)
                return { status: 200, body: res }
            },
            deleteFriend: async ({ params: { friendShipId } }) => {
                const res = await this.friendsService.deleteFriend(username, friendShipId)
                return isContractError(res) ? res : { status: 202, body: null }
            }
        })
    }
}
