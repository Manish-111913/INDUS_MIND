# VPC: 2 AZ, three tiers — public (ALB/NAT), private (app/ECS), isolated (data)
# (docs/02 §48). One NAT gateway per AZ so private tasks reach Bedrock/Anthropic
# + ECR + Secrets Manager while staying unreachable from the internet.

locals {
  name = "${var.project}-${var.environment}"
  # /20 subnets carved from the /16, one set per tier per AZ.
  public_subnets   = [for i, _ in var.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  private_subnets  = [for i, _ in var.azs : cidrsubnet(var.vpc_cidr, 4, i + 4)]
  isolated_subnets = [for i, _ in var.azs : cidrsubnet(var.vpc_cidr, 4, i + 8)]
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-igw" }
}

# ── public subnets ────────────────────────────────────────────────────────────
resource "aws_subnet" "public" {
  count                   = length(var.azs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnets[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.name}-public-${var.azs[count.index]}", Tier = "public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${local.name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ── NAT (one per AZ) ──────────────────────────────────────────────────────────
resource "aws_eip" "nat" {
  count  = length(var.azs)
  domain = "vpc"
  tags   = { Name = "${local.name}-nat-eip-${count.index}" }
}

resource "aws_nat_gateway" "main" {
  count         = length(var.azs)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  tags          = { Name = "${local.name}-nat-${count.index}" }
  depends_on    = [aws_internet_gateway.main]
}

# ── private (app) subnets ─────────────────────────────────────────────────────
resource "aws_subnet" "private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_subnets[count.index]
  availability_zone = var.azs[count.index]
  tags              = { Name = "${local.name}-private-${var.azs[count.index]}", Tier = "app" }
}

resource "aws_route_table" "private" {
  count  = length(var.azs)
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }
  tags = { Name = "${local.name}-private-rt-${count.index}" }
}

resource "aws_route_table_association" "private" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ── isolated (data) subnets — no internet route ───────────────────────────────
resource "aws_subnet" "isolated" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.isolated_subnets[count.index]
  availability_zone = var.azs[count.index]
  tags              = { Name = "${local.name}-isolated-${var.azs[count.index]}", Tier = "data" }
}

resource "aws_route_table" "isolated" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-isolated-rt" }
}

resource "aws_route_table_association" "isolated" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.isolated[count.index].id
  route_table_id = aws_route_table.isolated.id
}
