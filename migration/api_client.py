# migration/api_client.py
import requests
import time
import logging
from typing import Dict, Any, Optional
from config import Config

logger = logging.getLogger(__name__)

class APIClient:
    """Cliente para API do sistema novo"""
    
    def __init__(self):
        self.config = Config()
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'NFC-e-Migration/1.0'
        })
    
    def build_qr_code_url(self, nota: Dict[str, Any]) -> str:
        """Constrói URL do QR Code baseada nos dados da nota"""
        try:
            # Remove espaços e caracteres especiais
            chave = str(nota.get('chave', '')).strip()
            versao = str(nota.get('versao', '')).strip()
            ambiente = str(nota.get('ambiente', '')).strip()
            cIdToken = str(nota.get('cIdToken', '')).strip()
            vSig = str(nota.get('vSig', '')).strip()
            
            # Constrói URL baseada na sua query SQL
            qr_url = f"https://www.sefaz.mt.gov.br/nfce/consultanfce?p={chave}|{versao}|{ambiente}|{cIdToken}|{vSig}"
            
            logger.debug(f"🔗 QR Code gerado: {qr_url}")
            return qr_url
            
        except Exception as e:
            logger.error(f"❌ Erro ao construir QR Code: {e}")
            return None
    
    def process_nfce(self, qr_url: str, max_retries: int = None) -> Dict[str, Any]:
        """Processa NFC-e usando o endpoint de scan"""
        if max_retries is None:
            max_retries = self.config.MAX_RETRIES
        
        for attempt in range(max_retries + 1):
            try:
                logger.info(f"🔄 Tentativa {attempt + 1}/{max_retries + 1} - Processando NFC-e")
                
                payload = {
                    "qrCode": qr_url
                }
                
                if self.config.DRY_RUN:
                    logger.info(f"🧪 DRY RUN - Payload que seria enviado: {payload}")
                    return {
                        "success": True,
                        "data": {"chave": "DRY_RUN_TEST"},
                        "message": "DRY RUN - NFC-e não foi processada",
                        "dry_run": True
                    }
                
                response = self.session.post(
                    self.config.API_SCAN_ENDPOINT,
                    json=payload,
                    timeout=30
                )
                
                if response.status_code == 200:
                    result = response.json()
                    logger.info(f"✅ NFC-e processada com sucesso: {result.get('message', '')}")
                    return result
                else:
                    error_msg = f"Erro HTTP {response.status_code}: {response.text}"
                    logger.warning(f"⚠️ {error_msg}")
                    
                    if attempt < max_retries:
                        delay = self.config.RETRY_DELAY * (2 ** attempt)  # Backoff exponencial
                        logger.info(f"⏳ Aguardando {delay}s antes da próxima tentativa...")
                        time.sleep(delay)
                        continue
                    else:
                        return {
                            "success": False,
                            "error": error_msg,
                            "status_code": response.status_code
                        }
                        
            except requests.exceptions.Timeout:
                error_msg = "Timeout na requisição"
                logger.warning(f"⏰ {error_msg}")
                
                if attempt < max_retries:
                    delay = self.config.RETRY_DELAY * (2 ** attempt)
                    logger.info(f"⏳ Aguardando {delay}s antes da próxima tentativa...")
                    time.sleep(delay)
                    continue
                else:
                    return {
                        "success": False,
                        "error": error_msg
                    }
                    
            except requests.exceptions.ConnectionError:
                error_msg = "Erro de conexão com a API"
                logger.error(f"🔌 {error_msg}")
                
                if attempt < max_retries:
                    delay = self.config.RETRY_DELAY * (2 ** attempt)
                    logger.info(f"⏳ Aguardando {delay}s antes da próxima tentativa...")
                    time.sleep(delay)
                    continue
                else:
                    return {
                        "success": False,
                        "error": error_msg
                    }
                    
            except Exception as e:
                error_msg = f"Erro inesperado: {str(e)}"
                logger.error(f"💥 {error_msg}")
                
                if attempt < max_retries:
                    delay = self.config.RETRY_DELAY * (2 ** attempt)
                    logger.info(f"⏳ Aguardando {delay}s antes da próxima tentativa...")
                    time.sleep(delay)
                    continue
                else:
                    return {
                        "success": False,
                        "error": error_msg
                    }
        
        return {
            "success": False,
            "error": "Número máximo de tentativas excedido"
        }
    
    def test_connection(self) -> bool:
        """Testa conexão com a API"""
        try:
            response = self.session.get(f"{self.config.API_BASE_URL}/api/status", timeout=10)
            
            if response.status_code == 200:
                logger.info("✅ Conexão com API estabelecida")
                return True
            else:
                logger.error(f"❌ API retornou status {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Erro ao testar conexão com API: {e}")
            return False
    
    def get_api_status(self) -> Dict[str, Any]:
        """Retorna status da API"""
        try:
            response = self.session.get(f"{self.config.API_BASE_URL}/api/status", timeout=10)
            
            if response.status_code == 200:
                return response.json()
            else:
                return {
                    "error": f"Status {response.status_code}",
                    "message": response.text
                }
                
        except Exception as e:
            return {
                "error": str(e),
                "message": "Erro ao conectar com API"
            }
