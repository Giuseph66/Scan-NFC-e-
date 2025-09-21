#!/usr/bin/env python3
# migration/migrate_sqlite.py
# Script simplificado para migrar do database_old.sqlite

import sys
import os
import sqlite3
import requests
import time
from pathlib import Path
from tqdm import tqdm
from colorama import init, Fore, Style

# Inicializa colorama
init(autoreset=True)

class SQLiteMigrator:
    """Migrador simplificado para SQLite"""
    
    def __init__(self):
        # Caminhos
        self.old_db_path = Path(__file__).parent.parent / "database_old.sqlite"
        #self.api_url = "https://teste.neurelix.com.br/api/scan/process"
        self.api_url = "http://localhost:1425/api/scan/process"
        
        # Estatísticas
        self.stats = {
            'total': 0,
            'success': 0,
            'failed': 0,
            'duplicated': 0,
            'errors': []
        }
    
    def print_header(self):
        """Imprime cabeçalho do programa"""
        print(f"{Fore.CYAN}{'='*60}")
        print(f"{Fore.CYAN}🚀 MIGRADOR NFC-e - SQLite para Sistema Novo")
        print(f"{Fore.CYAN}{'='*60}")
        print(f"{Fore.WHITE}📁 Banco antigo: {self.old_db_path}")
        print(f"{Fore.WHITE}🌐 API destino: {self.api_url}")
        print(f"{Fore.CYAN}{'='*60}\n")
    
    def validate_setup(self) -> bool:
        """Valida configuração antes de iniciar"""
        print(f"{Fore.YELLOW}🔍 Validando configuração...")
        
        # Verifica se banco antigo existe
        if not self.old_db_path.exists():
            print(f"{Fore.RED}❌ Banco antigo não encontrado: {self.old_db_path}")
            return False
        
        # Testa conexão com API
        try:
            #response = requests.get("https://teste.neurelix.com.br/api/status", timeout=5)
            response = requests.get("http://localhost:1425/api/status", timeout=5)
            if response.status_code == 200:
                print(f"{Fore.GREEN}✅ API do sistema novo está funcionando")
            else:
                print(f"{Fore.RED}❌ API retornou status {response.status_code}")
                return False
        except Exception as e:
            print(f"{Fore.RED}❌ Erro ao conectar com API: {e}")
            return False
        
        # Conta registros no banco antigo
        try:
            conn = sqlite3.connect(self.old_db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT COUNT(*) FROM notas_fiscais
                WHERE chave IS NOT NULL 
                    AND versao IS NOT NULL 
                    AND ambiente IS NOT NULL 
                    AND cIdToken IS NOT NULL 
                    AND vSig IS NOT NULL
            """)
            
            self.stats['total'] = cursor.fetchone()[0]
            conn.close()
            
            print(f"{Fore.GREEN}✅ Banco antigo: {self.stats['total']} notas válidas encontradas")
            return True
            
        except Exception as e:
            print(f"{Fore.RED}❌ Erro ao acessar banco antigo: {e}")
            return False
    
    def build_qr_url(self, nota) -> str:
        """Constrói URL do QR Code baseada na nota"""
        chave = str(nota['chave']).strip()
        versao = str(nota['versao']).strip()
        ambiente = str(nota['ambiente']).strip()
        cIdToken = str(nota['cIdToken']).strip()
        vSig = str(nota['vSig']).strip()
        
        return f"https://www.sefaz.mt.gov.br/nfce/consultanfce?p={chave}|{versao}|{ambiente}|{cIdToken}|{vSig}"
    
    def process_nota(self, nota) -> bool:
        """Processa uma nota individual"""
        try:
            # Constrói QR Code
            qr_url = self.build_qr_url(nota)
            
            # Envia para API
            payload = {"qrCode": qr_url}
            response = requests.post(self.api_url, json=payload, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get('success'):
                    salva = result.get('salva', {})
                    if salva.get('status') == 'duplicada':
                        self.stats['duplicated'] += 1
                        print(f"{Fore.YELLOW}⚠️  Nota {nota['id']} duplicada")
                        return True
                    else:
                        self.stats['success'] += 1
                        print(f"{Fore.GREEN}✅ Nota {nota['id']} processada")
                        return True
                else:
                    error = result.get('error', 'Erro desconhecido')
                    self.stats['failed'] += 1
                    self.stats['errors'].append(f"Nota {nota['id']}: {error}")
                    print(f"{Fore.RED}❌ Nota {nota['id']} falhou: {error}")
                    return False
            else:
                error = f"HTTP {response.status_code}: {response.text}"
                self.stats['failed'] += 1
                self.stats['errors'].append(f"Nota {nota['id']}: {error}")
                print(f"{Fore.RED}❌ Nota {nota['id']} falhou: {error}")
                return False
                
        except Exception as e:
            error = str(e)
            self.stats['failed'] += 1
            self.stats['errors'].append(f"Nota {nota['id']}: {error}")
            print(f"{Fore.RED}❌ Nota {nota['id']} erro: {error}")
            return False
    
    def migrate(self, limit=None, dry_run=False):
        """Executa migração"""
        self.print_header()
        
        if not self.validate_setup():
            print(f"{Fore.RED}❌ Validação falhou. Abortando.")
            return
        
        if dry_run:
            print(f"{Fore.YELLOW}🧪 MODO DRY RUN - Nenhuma nota será processada realmente")
            return
        
        print(f"{Fore.GREEN}🚀 Iniciando migração...\n")
        
        try:
            # Conecta no banco antigo
            conn = sqlite3.connect(self.old_db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Query para buscar notas
            query = """
            SELECT 
                id, chave, versao, ambiente, cIdToken, vSig,
                cnpjEmitente, nomeEmitente, ieEmitente, createdAt
            FROM notas_fiscais
            WHERE chave IS NOT NULL 
                AND versao IS NOT NULL 
                AND ambiente IS NOT NULL 
                AND cIdToken IS NOT NULL 
                AND vSig IS NOT NULL
            ORDER BY createdAt DESC
            """
            
            if limit:
                query += f" LIMIT {limit}"
            
            cursor.execute(query)
            notas = cursor.fetchall()
            
            # Processa com barra de progresso
            with tqdm(total=len(notas), desc="Migrando", unit="nota") as pbar:
                for nota in notas:
                    self.process_nota(dict(nota))
                    pbar.update(1)
                    
                    # Pequena pausa entre requisições
                    time.sleep(0.5)
            
            conn.close()
            
        except KeyboardInterrupt:
            print(f"\n{Fore.YELLOW}⚠️ Migração interrompida pelo usuário")
        except Exception as e:
            print(f"\n{Fore.RED}💥 Erro durante migração: {e}")
        finally:
            self.print_summary()
    
    def print_summary(self):
        """Imprime resumo da migração"""
        print(f"\n{Fore.CYAN}{'='*60}")
        print(f"{Fore.CYAN}📊 RESUMO DA MIGRAÇÃO")
        print(f"{Fore.CYAN}{'='*60}")
        print(f"{Fore.WHITE}📈 Total de notas: {self.stats['total']}")
        print(f"{Fore.GREEN}✅ Processadas com sucesso: {self.stats['success']}")
        print(f"{Fore.RED}❌ Falharam: {self.stats['failed']}")
        print(f"{Fore.YELLOW}⚠️  Duplicadas: {self.stats['duplicated']}")
        
        if self.stats['total'] > 0:
            success_rate = (self.stats['success'] / self.stats['total']) * 100
            print(f"{Fore.CYAN}📊 Taxa de sucesso: {success_rate:.1f}%")
        
        if self.stats['errors']:
            print(f"\n{Fore.RED}❌ PRIMEIROS ERROS:")
            for error in self.stats['errors'][:5]:
                print(f"{Fore.RED}  • {error}")
            if len(self.stats['errors']) > 5:
                print(f"{Fore.RED}  ... e mais {len(self.stats['errors']) - 5} erros")
        
        print(f"{Fore.CYAN}{'='*60}")

def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Migrador NFC-e SQLite")
    parser.add_argument('--limit', type=int, help='Limite de notas para processar')
    parser.add_argument('--dry-run', action='store_true', help='Modo de teste')
    parser.add_argument('--test', action='store_true', help='Apenas testa conexões')
    
    args = parser.parse_args()
    
    migrator = SQLiteMigrator()
    
    if args.test:
        migrator.print_header()
        if migrator.validate_setup():
            print(f"{Fore.GREEN}✅ Todas as conexões estão funcionando!")
        else:
            print(f"{Fore.RED}❌ Alguma conexão falhou!")
    else:
        migrator.migrate(limit=args.limit, dry_run=args.dry_run)

if __name__ == "__main__":
    main()