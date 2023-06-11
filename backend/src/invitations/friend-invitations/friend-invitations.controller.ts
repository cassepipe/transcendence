import { Controller, UseGuards, Request } from "@nestjs/common"
import {
	NestControllerInterface,
	NestRequestShapes,
	TsRest,
	TsRestRequest,
	nestControllerContract,
} from "@ts-rest/nest"
import { contract } from "contract"
import { FriendInvitationsService } from "./friend-invitations.service"
import { JwtAuthGuard } from "src/auth/jwt-auth.guard"
import { EnrichedRequest } from "src/auth/auth.service"

const c = nestControllerContract(contract.invitations.friend)
type RequestShapes = NestRequestShapes<typeof c>

@Controller()
@TsRest({ jsonQuery: true })
export class FriendInvitationsController implements NestControllerInterface<typeof c> {
	constructor(private readonly friendInvitationsService: FriendInvitationsService) {}

	@UseGuards(JwtAuthGuard)
	@TsRest(c.getFriendInvitations)
	async getFriendInvitations(
		@Request() req: EnrichedRequest,
		@TsRestRequest() { query: { status } }: RequestShapes["getFriendInvitations"],
	) {
		const body = await this.friendInvitationsService.getFriendInvitations(
			req.user.username,
			status,
		)
		return { status: 200 as const, body }
	}

	@UseGuards(JwtAuthGuard)
	@TsRest(c.getFriendInvitationById)
	async getFriendInvitationById(
		@Request() req: EnrichedRequest,
		@TsRestRequest() { params: { id } }: RequestShapes["getFriendInvitationById"],
	) {
		const body = await this.friendInvitationsService.getFriendInvitationById(
			req.user.username,
			id,
		)
		return { status: 200 as const, body }
	}

	@UseGuards(JwtAuthGuard)
	@TsRest(c.createFriendInvitation)
	async createFriendInvitation(
		@Request() req: EnrichedRequest,
		@TsRestRequest() { body: { invitedUserName } }: RequestShapes["createFriendInvitation"],
	) {
		const body = await this.friendInvitationsService.createFriendInvitation(
			req.user.username,
			invitedUserName,
		)
		return { status: 201 as const, body }
	}

	@UseGuards(JwtAuthGuard)
	@TsRest(c.updateFriendInvitation)
	async updateFriendInvitation(
		@Request() req: EnrichedRequest,
		@TsRestRequest()
		{ body: { status }, params: { id } }: RequestShapes["updateFriendInvitation"],
	) {
		const body = await this.friendInvitationsService.updateFriendInvitation(
			req.user.username,
			status,
			id,
		)
		return { status: 200 as const, body }
	}
}