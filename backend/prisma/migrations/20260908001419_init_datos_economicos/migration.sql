-- CreateTable
CREATE TABLE "datos_economicos" (
    "id" SERIAL NOT NULL,
    "dataset" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "codigo_dane" TEXT,
    "anio" INTEGER NOT NULL,
    "indicador" TEXT NOT NULL,
    "valor" DOUBLE PRECISION,
    "unidad" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datos_economicos_pkey" PRIMARY KEY ("id")
);
