.DEFAULT_GOAL := help

.PHONY: help serve dev

help: ## List targets and what they do
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

serve: ## Serve this checkout at http://localhost:3000 for the installed Nikke Manager extension
	@echo "http://localhost:3000/"
	@echo "Close any open https://pilgrimworks.github.io/Nikke-Manager tab before Import Data."
	@echo "The extension updates an already-open manager tab and will not reach localhost while that tab exists."
	python3 -m http.server 3000

dev: ## Alias for serve
	@$(MAKE) serve
