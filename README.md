# Gaiangrid Website Local Development

This repo is the project-specific website layer for the `gaiangrid.com`
deployment.

It follows the boundary defined in
[`docs/OPEN_SOURCE_BOUNDARY.md`](/ssd2/Gaian/Workspace/docs/OPEN_SOURCE_BOUNDARY.md):

- the reusable system stays in the open-source core repos
- this repo owns branded landing-page copy, visuals, and project-specific
  presentation

The site is plain HTML and CSS served by `nginx`.

That is intentional:

- no Node toolchain
- no build step
- no second frontend architecture that production does not need

## Local Preview

Start:

```bash
docker compose up -d
```

Open:

```text
http://127.0.0.1:8083
```

The bind mount means edits under [`src/`](/ssd2/Gaian/Workspace/gaiangrid_website/src)
are visible on refresh without rebuilding.

The standalone preview serves:

- `/`
- `/quicksetup`

It does not serve the enrollment flow locally. In the integrated host shape,
`/enroll` and `/enroll/verify` are still provided by
[`enrollment_portal`](/ssd2/Gaian/Workspace/enrollment_portal).

Stop:

```bash
docker compose down
```

## AWS Deployment

This repo is shaped so it can replace the generic
[`telemetry_website`](/ssd2/Gaian/Workspace/telemetry_website) content on the
AWS host without changing the host runtime shape.

Deploy it into the existing `telemetry_website` slot with:

```bash
export AWS_PROFILE=deployment
export AWS_DEFAULT_REGION=ap-southeast-2

bash /ssd2/Gaian/Workspace/infra/scripts/deploy_ec2_service.sh telemetry_website \
  --local-dir /ssd2/Gaian/Workspace/gaiangrid_website
```

That keeps the public route contract unchanged:

- `/`
- `/quicksetup`
- `/enroll`
- `/enroll/verify`
- `/api/v1/enrollment`

Only the static site content changes.
