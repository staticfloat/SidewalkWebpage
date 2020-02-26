.PHONY: dev docker-up docker-up-db docker-run docker-stop ssh stage-import

db ?= sidewalk

dev: docker-run

docker-up:
	@docker-compose up -d

docker-up-db:
	@docker-compose up -d db

docker-stop:
	@docker-compose stop
	@docker-compose rm -f

docker-run:
	@docker-compose run --rm --service-ports --name projectsidewalk-web web /bin/bash

logs:
	@docker-compose logs -f --tail=100

destroy:
	@echo -n "WARNING: This is going to wipe your database state clean, allowing it to re-initialize!  Hit CTRL-C if you don't want to do this..."
	@for idx in $$(seq 1 6); do \
		sleep 1; \
		echo -n "."; \
	done;
	@echo
	@docker-compose down -v

ssh:
	@docker exec -it projectsidewalk-$${target} /bin/bash

import-dump:
	@docker exec -it projectsidewalk-db sh -c "/opt/import-dump.sh $(db)"

.PHONY: docker-run logs
