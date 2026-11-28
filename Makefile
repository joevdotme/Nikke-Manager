.DEFAULT_GOAL := help

.PHONY: help serve dev catalog catalog-game catalog-fandom catalog-prydwen catalog-enikk verify

help: ## List targets and what they do
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

serve: ## Serve this checkout at http://localhost:3000 for the installed Nikke Manager extension
	@echo "http://localhost:3000/"
	@echo "Close any open https://pilgrimworks.github.io/Nikke-Manager tab before Import Data."
	@echo "The extension updates an already-open manager tab and will not reach localhost while that tab exists."
	python3 -m http.server 3000

dev: ## Alias for serve
	@$(MAKE) serve

catalog: ## Rebuild game, Fandom weapon, and enikk knowledge files and print the changelog. Does not open a pull request
	node scripts/rebuild-catalog.js --write

catalog-game: ## Scrape the game catalog only. Does not open a pull request
	node scripts/rebuild-catalog.js --source game --write

catalog-fandom: ## Compare weapons with the Fandom wiki (CC BY-SA). Does not open a pull request
	node scripts/rebuild-catalog.js --source fandom --write

catalog-prydwen: ## Retired name for catalog-fandom
	@$(MAKE) catalog-fandom

catalog-enikk: ## Scrape the enikk solo raid season only. Does not open a pull request
	node scripts/rebuild-catalog.js --source enikk --write

verify: ## Run the import-merge gate and the weapon gate. Neither script writes the database
	node scripts/verify-import-merge.js
	node scripts/verify-weapons.js
