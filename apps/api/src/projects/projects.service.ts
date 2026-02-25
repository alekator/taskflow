import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  private async getProject(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });
  }

  private async requireRole(userId: string, projectId: string) {
    const project = await this.getProject(projectId);
    if (!project) throw new NotFoundException('Project not found');

    if (project.ownerId === userId) return ProjectRole.OWNER;

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });

    if (!member) throw new ForbiddenException();
    return member.role;
  }

  async create(userId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: ProjectRole.OWNER,
          },
        },
      },
    });
  }

  async findMy(userId: string) {
    return this.prisma.project.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, projectId: string) {
    await this.requireRole(userId, projectId);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    return project;
  }

  async update(userId: string, projectId: string, dto: UpdateProjectDto) {
    const role = await this.requireRole(userId, projectId);
    if (!role) throw new NotFoundException('Project not found');
    if (role !== ProjectRole.OWNER && role !== ProjectRole.MANAGER) {
      throw new ForbiddenException();
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      },
    });
  }

  async remove(userId: string, projectId: string) {
    const role = await this.requireRole(userId, projectId);
    if (!role) throw new NotFoundException('Project not found');
    if (role !== ProjectRole.OWNER && role !== ProjectRole.MANAGER) {
      throw new ForbiddenException();
    }

    await this.prisma.project.delete({ where: { id: projectId } });
    return { ok: true };
  }

  async listMembers(requesterId: string, projectId: string) {
    await this.requireRole(requesterId, projectId);

    return this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    });
  }

  async addMember(requesterId: string, projectId: string, dto: AddMemberDto) {
    const requesterRole = await this.requireRole(requesterId, projectId);

    if (
      requesterRole !== ProjectRole.OWNER &&
      requesterRole !== ProjectRole.MANAGER
    ) {
      throw new ForbiddenException();
    }

    const project = await this.getProject(projectId);
    if (!project) throw new NotFoundException('Project not found');

    const roleToSet = dto.role ?? ProjectRole.MEMBER;
    if (
      requesterRole === ProjectRole.MANAGER &&
      roleToSet !== ProjectRole.MEMBER
    ) {
      throw new ForbiddenException();
    }

    if (dto.userId === project.ownerId) {
      throw new ConflictException('Owner is already in project');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    try {
      return await this.prisma.projectMember.create({
        data: {
          projectId,
          userId: dto.userId,
          role: roleToSet,
        },
        select: {
          userId: true,
          role: true,
          user: { select: { id: true, email: true, name: true } },
        },
      });
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('User already in project');
      }
      throw e;
    }
  }

  async updateMemberRole(
    requesterId: string,
    projectId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const requesterRole = await this.requireRole(requesterId, projectId);

    if (
      requesterRole !== ProjectRole.OWNER &&
      requesterRole !== ProjectRole.MANAGER
    ) {
      throw new ForbiddenException();
    }

    const project = await this.getProject(projectId);
    if (!project) throw new NotFoundException('Project not found');

    if (targetUserId === project.ownerId) throw new ForbiddenException();

    if (dto.role === ProjectRole.OWNER) throw new ForbiddenException();

    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (requesterRole === ProjectRole.MANAGER) {
      if (target.role !== ProjectRole.MEMBER) throw new ForbiddenException();
      if (dto.role !== ProjectRole.MEMBER) throw new ForbiddenException();
    }

    return this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { role: dto.role },
      select: {
        userId: true,
        role: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async removeMember(
    requesterId: string,
    projectId: string,
    targetUserId: string,
  ) {
    const requesterRole = await this.requireRole(requesterId, projectId);

    if (
      requesterRole !== ProjectRole.OWNER &&
      requesterRole !== ProjectRole.MANAGER
    ) {
      throw new ForbiddenException();
    }

    const project = await this.getProject(projectId);
    if (!project) throw new NotFoundException('Project not found');

    if (targetUserId === project.ownerId) throw new ForbiddenException();

    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (
      requesterRole === ProjectRole.MANAGER &&
      target.role !== ProjectRole.MEMBER
    ) {
      throw new ForbiddenException();
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    return { ok: true };
  }

  async leave(userId: string, projectId: string) {
    const project = await this.getProject(projectId);
    if (!project) throw new NotFoundException('Project not found');

    if (project.ownerId === userId) throw new ForbiddenException();

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { userId: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });

    return { ok: true };
  }
}
