"""Google authorization shared by sheet.py (Base_Datos) and ventas.py (Ventas-Sevencars).

Default: reuse the OAuth user authorization of the editor-fotos-seven project (same flow as its
drive_client.service()). Optional alternative: a service account via GOOGLE_SERVICE_ACCOUNT_JSON.
The credential files are only loaded by the Google libraries at runtime; never printed or copied.
"""
from __future__ import annotations

import os
from pathlib import Path

EDITOR_FOTOS_DIR = Path("/home/seb/editor-fotos-seven")
DEFAULT_OAUTH_CLIENT = EDITOR_FOTOS_DIR / "credentials.json"
DEFAULT_OAUTH_TOKEN = EDITOR_FOTOS_DIR / "token.json"
# Same scope list as editor-fotos-seven; the Sheets API accepts the Drive scope.
OAUTH_SCOPES = ["https://www.googleapis.com/auth/drive"]
SA_SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]

_client = None


class CredentialsMissing(Exception):
    pass


class BrowserLoginRequired(CredentialsMissing):
    pass


def env_path(var: str, default: Path) -> Path:
    return Path(os.environ.get(var) or default).expanduser()


def oauth_paths() -> tuple[Path, Path]:
    return (env_path("GOOGLE_OAUTH_CLIENT_JSON", DEFAULT_OAUTH_CLIENT),
            env_path("GOOGLE_OAUTH_TOKEN_JSON", DEFAULT_OAUTH_TOKEN))


def _load_oauth_credentials(allow_browser: bool):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    client_path, token_path = oauth_paths()
    creds = None
    if token_path.is_file():
        creds = Credentials.from_authorized_user_file(str(token_path), OAUTH_SCOPES)
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            token_path.write_text(creds.to_json())   # persist the refreshed token, like editor-fotos-seven
            return creds
        except Exception as exc:
            if not allow_browser:
                raise BrowserLoginRequired(f"no se pudo renovar el token ({exc}); hace falta iniciar sesión en el navegador")
    if not client_path.is_file():
        raise CredentialsMissing(f"no existe el archivo de cliente OAuth {client_path}")
    if not allow_browser:
        raise BrowserLoginRequired("hace falta iniciar sesión con Google en el navegador (token ausente o caducado)")
    from google_auth_oauthlib.flow import InstalledAppFlow
    flow = InstalledAppFlow.from_client_secrets_file(str(client_path), OAUTH_SCOPES)
    creds = flow.run_local_server(port=0)
    token_path.write_text(creds.to_json())
    return creds


def _load_service_account(path: Path):
    from google.oauth2.service_account import Credentials
    if not path.is_file():
        raise CredentialsMissing(f"no existe el JSON de la cuenta de servicio: {path}")
    return Credentials.from_service_account_file(str(path), scopes=SA_SCOPES)


def load_google_credentials(allow_browser: bool = True):
    sa = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if sa:
        return _load_service_account(Path(sa).expanduser())
    if os.environ.get("FICHAS_NO_BROWSER"):
        allow_browser = False
    return _load_oauth_credentials(allow_browser)


def gspread_client(allow_browser: bool = True):
    """Authorized gspread client (created once per process)."""
    global _client
    if _client is None:
        import gspread
        _client = gspread.authorize(load_google_credentials(allow_browser))
    return _client


def describe_google_error(exc: BaseException) -> str:
    """Readable Spanish message for gspread/google errors (gspread wraps APIError in PermissionError)."""
    cause = exc.__cause__ if (not str(exc) and exc.__cause__ is not None) else exc
    text = str(cause) or type(cause).__name__
    if "has not been used in project" in text or "it is disabled" in text:
        import re
        m = re.search(r"https://console\.developers\.google\.com/\S+", text)
        return ("la API de Google Sheets no está habilitada en el proyecto de Google Cloud de estas credenciales. "
                "Habilitala una sola vez (con la cuenta de Google que autorizó editor-fotos-seven) en: "
                + (m.group(0).rstrip(".") if m else "https://console.cloud.google.com/apis/library/sheets.googleapis.com")
                + " y esperá unos minutos.")
    if "403" in text and "permission" in text.lower():
        return "la cuenta autorizada no tiene permiso sobre esta hoja (pedile al dueño que la comparta): " + text
    return text


def credentials_help(exc: Exception) -> str:
    client_path, token_path = oauth_paths()
    if isinstance(exc, BrowserLoginRequired):
        return (
            f"Hace falta autorizar el acceso a Google: {exc}\n"
            "Volvé a ejecutar el comando (sin la variable FICHAS_NO_BROWSER) para que se abra la ventana de\n"
            "inicio de sesión de Google; es la misma autorización que usa editor-fotos-seven. También podés\n"
            "iniciar sesión desde ese proyecto y volver a intentar."
        )
    return (
        f"No se encontraron las credenciales de Google: {exc}\n"
        "La herramienta reutiliza la autorización de Google del proyecto editor-fotos-seven:\n"
        f"  - archivo de cliente OAuth: {client_path}  (GOOGLE_OAUTH_CLIENT_JSON)\n"
        f"  - token de usuario:         {token_path}  (GOOGLE_OAUTH_TOKEN_JSON)\n"
        "Alternativa: una cuenta de servicio con GOOGLE_SERVICE_ACCOUNT_JSON. Ver 'Acceso a Google' en README.md.\n"
        "Mientras tanto podés trabajar con un export local: --sheet data/base_datos_vehiculos.xlsx"
    )
