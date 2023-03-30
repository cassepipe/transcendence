import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { AppService } from 'src/app.service';

enum EventTypeList
{
	NEW_FRIEND = "NEW_FRIEND",
	DELETED_FRIEND = "DELETED_FRIEND"
}

@Injectable()
export class FriendsService
{

	constructor(private readonly prisma: PrismaService,
			   	private readonly appService: AppService) {}


	private friendShipSelect: Prisma.FriendShipSelect =
	{
		id: true,
		creationDate: true,
		requestingUserName: true,
		requestedUserName: true,
		directMessage: { select: { id: true } },
	}


	async getFriends(username: string)
	{
		return this.prisma.friendShip.findMany({
			where:
			{
				OR:
				[
					{ requestedUserName: username },
					{ requestingUserName: username },
				]
			},
			select: this.friendShipSelect })
	}

	async acceptInvitation(username: string, id: number)
	{
		try
		{
			const { invitingUserName } = await this.prisma.friendInvitation.delete({
				where:
				{
					invitedUserName: username,
					id: id
				},
				select: { invitingUserName: true }})
			const newFriendShip = await this.prisma.friendShip.create({
				data:
				{
					requestingUser: { connect: { name: invitingUserName } },
					requestedUser: { connect: { name: username } }
				},
				select: this.friendShipSelect })
			await this.appService.pushEvent(invitingUserName,
				{
					type: EventTypeList.NEW_FRIEND,
					data: { deletedFriendInvitationId: id, friend: newFriendShip }
				})
		}
		catch (e)
		{
			console.log(e)
			if (e.code === 'P2025')
				throw new ForbiddenException(`invitation with id ${id} not found`)
			if (e.code === 'P2002')
				throw new ConflictException(`friendship already exist`) // should never happen
		}
	}

	async deleteFriend(username: string, id: number)
	{
		try
		{
			const { requestedUserName, requestingUserName } = await this.prisma.friendShip.delete({
				where: { id: id },
				select:
				{
					requestedUserName: true,
					requestingUserName: true,
				}})
			await this.appService.pushEvent((username === requestedUserName) && requestingUserName || requestedUserName,
				{
					type: EventTypeList.DELETED_FRIEND,
					data: { deletedFriendId: id }
				})
		}
		catch
		{
			throw new NotFoundException(`friendship with id ${id} not found`)
		}
	}
}