{ pkgs, ... }: {
  channel = "stable-24.05";
  packages = [
    pkgs.nodejs_20
  ];
  env = { };
  idx = {
    extensions = [
      "christian-kohler.path-intellisense"
      "dsznajder.es7-react-js-snippets"
      "bradlc.vscode-tailwindcss"
    ];
    previews = {
      enable = true;
      previews = {
        web = {
          command = [
            "npm"
            "run"
            "dev"
            "--"
            "-p"
            "$PORT"
            "--hostname"
            "0.0.0.0"
          ];
          manager = "web";
        };
      };
    };
    workspace = {
      onCreate = {
        npm-install = "npm install";
      };
      onStart = {
        # Optional: Add any start commands here
      };
    };
  };
}
