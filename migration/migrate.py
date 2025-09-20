#!/usr/bin/env python3
# migration/migrate.py

import sys
import os
import argparse
from typing import List, Dict, Any
from tqdm import tqdm

# Adiciona o diretório atual ao path para imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import Config
from database_connector import DatabaseConnector
from api_client import APIClient
from logger import logger, MigrationStats

class NFCMigration:
    """Sistema principal de migração de NFC-e"""
    
    def __init__(self):
        self.config = Config()
        self.db_connector = DatabaseConnector()
        self.api_client = APIClient()
        self.stats = MigrationStats()
        
    def validate_config(self) -> bool:
        """Valida configurações antes de iniciar migração"""
        logger.info("🔍 Validando configurações...")
        
        # Testa conexão com banco antigo
        try:
            self.db_connector.connect()
            total_notas = self.db_connector.get_total_notas()
            logger.info(f"📊 Banco antigo: {total_notas} notas encontradas")
            self.stats.total_notas = total_notas
            self.db_connector.disconnect()
        except Exception as e:
            logger.error(f"❌ Erro ao conectar no banco antigo: {e}")
            return False
        
        # Testa conexão com API
        if not self.api_client.test_connection():
            logger.error("❌ Erro ao conectar com API do sistema novo")
            return False
        
        # Mostra status da API
        api_status = self.api_client.get_api_status()
        logger.info(f"🌐 API Status: {api_status}")
        
        return True
    
    def process_batch(self, notas: List[Dict[str, Any]]) -> None:
        """Processa um lote de notas"""
        for nota in notas:
            try:
                # Constrói URL do QR Code
                qr_url = self.api_client.build_qr_code_url(nota)
                if not qr_url:
                    self.stats.add_failure(nota['id'], "Falha ao construir QR Code")
                    continue
                
                # Processa via API
                result = self.api_client.process_nfce(qr_url)
                
                if result.get('success'):
                    if result.get('salva', {}).get('status') == 'duplicada':
                        self.stats.add_duplicate(
                            nota['id'], 
                            result.get('salva', {}).get('message', '')
                        )
                    else:
                        self.stats.add_success(
                            nota['id'],
                            result.get('message', 'Processada com sucesso')
                        )
                else:
                    self.stats.add_failure(
                        nota['id'], 
                        result.get('error', 'Erro desconhecido')
                    )
                    
            except Exception as e:
                logger.error(f"💥 Erro ao processar nota {nota['id']}: {e}")
                self.stats.add_failure(nota['id'], str(e))
    
    def migrate(self, limit: int = None, offset: int = 0) -> None:
        """Executa migração completa"""
        logger.info("🚀 Iniciando migração de NFC-e...")
        
        if not self.validate_config():
            logger.error("❌ Validação falhou. Abortando migração.")
            return
        
        try:
            # Conecta no banco antigo
            self.db_connector.connect()
            
            # Processa em lotes
            batch_size = self.config.BATCH_SIZE
            processed = 0
            
            with tqdm(total=self.stats.total_notas, desc="Migrando NFC-e") as pbar:
                while True:
                    # Busca próximo lote
                    notas = self.db_connector.get_notas_fiscais(
                        limit=batch_size, 
                        offset=offset + processed
                    )
                    
                    if not notas:
                        break
                    
                    # Processa lote
                    self.process_batch(notas)
                    processed += len(notas)
                    pbar.update(len(notas))
                    
                    # Para se atingiu o limite
                    if limit and processed >= limit:
                        break
            
            logger.info("✅ Migração concluída!")
            
        except KeyboardInterrupt:
            logger.warning("⚠️ Migração interrompida pelo usuário")
        except Exception as e:
            logger.error(f"💥 Erro durante migração: {e}")
        finally:
            # Fecha conexões
            self.db_connector.disconnect()
            
            # Mostra resumo
            print(self.stats.get_summary())
            
            # Salva erros se houver
            if self.stats.errors:
                self.stats.save_errors_to_file()
    
    def dry_run(self, limit: int = 5) -> None:
        """Executa migração em modo de teste (dry run)"""
        logger.info("🧪 Executando DRY RUN...")
        
        # Ativa modo dry run
        original_dry_run = self.config.DRY_RUN
        self.config.DRY_RUN = True
        
        try:
            self.migrate(limit=limit)
        finally:
            # Restaura configuração original
            self.config.DRY_RUN = original_dry_run

def main():
    """Função principal"""
    parser = argparse.ArgumentParser(
        description="Sistema de migração de NFC-e do banco antigo para o novo sistema"
    )
    
    parser.add_argument(
        '--limit', 
        type=int, 
        help='Limite de notas para processar (padrão: todas)'
    )
    
    parser.add_argument(
        '--offset', 
        type=int, 
        default=0,
        help='Offset para começar processamento (padrão: 0)'
    )
    
    parser.add_argument(
        '--dry-run', 
        action='store_true',
        help='Executa em modo de teste (não processa realmente)'
    )
    
    parser.add_argument(
        '--test-connection', 
        action='store_true',
        help='Apenas testa conexões e sai'
    )
    
    parser.add_argument(
        '--config', 
        type=str,
        help='Arquivo de configuração (.env)'
    )
    
    args = parser.parse_args()
    
    # Carrega configuração se especificada
    if args.config:
        os.environ['DOTENV_PATH'] = args.config
    
    # Cria instância do migrador
    migrator = NFCMigration()
    
    try:
        if args.test_connection:
            # Apenas testa conexões
            if migrator.validate_config():
                print("✅ Todas as conexões estão funcionando!")
                sys.exit(0)
            else:
                print("❌ Alguma conexão falhou!")
                sys.exit(1)
        
        elif args.dry_run:
            # Modo dry run
            migrator.dry_run(limit=args.limit or 5)
        
        else:
            # Migração normal
            migrator.migrate(limit=args.limit, offset=args.offset)
    
    except Exception as e:
        logger.error(f"💥 Erro fatal: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
